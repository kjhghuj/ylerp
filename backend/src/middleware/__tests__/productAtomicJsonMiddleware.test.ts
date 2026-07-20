import express from 'express';
import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { gzipSync } from 'zlib';
import {
  configureJsonBodyParsing,
  productAtomicRouteErrorHandler,
} from '../productAtomicJsonMiddleware';

const ATOMIC_BODY_LIMIT = 2 * 1024 * 1024;

interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

const sendRaw = async (
  port: number,
  method: 'POST' | 'PUT',
  path: string,
  chunks: Array<string | Buffer>,
  includeContentLength: boolean,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> => new Promise((resolve, reject) => {
  const headers: Record<string, string | number> = {
    'content-type': 'application/json',
    ...extraHeaders,
  };
  if (includeContentLength) {
    headers['content-length'] = chunks.reduce((total, chunk) => (
      total + (Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf8'))
    ), 0);
  }
  const request = http.request({
    hostname: '127.0.0.1',
    port,
    path,
    method,
    headers,
  }, response => {
    const responseChunks: Buffer[] = [];
    response.on('data', chunk => responseChunks.push(Buffer.from(chunk)));
    response.on('end', () => resolve({
      status: response.statusCode || 0,
      body: Buffer.concat(responseChunks).toString('utf8'),
      headers: response.headers,
    }));
  });
  request.on('error', reject);
  for (const chunk of chunks) request.write(chunk);
  request.end();
});

describe('atomic product raw JSON body limits', () => {
  let server: Server;
  let port: number;
  let atomicHandlerCalls: number;
  let atomicTransactionCalls: number;
  let ordinaryHandlerCalls: number;
  let lastTransferEncoding: string | undefined;

  beforeEach(async () => {
    atomicHandlerCalls = 0;
    atomicTransactionCalls = 0;
    ordinaryHandlerCalls = 0;
    lastTransferEncoding = undefined;
    const app = express();
    app.use((req, _res, next) => {
      lastTransferEncoding = req.headers['transfer-encoding'];
      next();
    });

    configureJsonBodyParsing(app);

    const atomicHandler: express.RequestHandler = (req, res) => {
      atomicHandlerCalls += 1;
      atomicTransactionCalls += 1;
      res.json({ body: req.body });
    };
    app.post('/api/products/with-templates', atomicHandler);
    app.put('/api/products/:id/with-templates', atomicHandler);
    app.post('/api/products/:id/templates', atomicHandler);
    app.put('/api/products/:id/templates/:linkId', atomicHandler);
    app.put('/api/products/:id/templates/:linkId/primary', atomicHandler);
    app.post('/api/templates', atomicHandler);
    app.put('/api/templates/:id', atomicHandler);
    app.post('/api/ordinary', (_req, res) => {
      ordinaryHandlerCalls += 1;
      res.json({ ok: true });
    });
    app.use(productAtomicRouteErrorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });

  it('rejects raw trailing whitespace over 2 MiB before the atomic handler', async () => {
    const body = '{}'.padEnd(ATOMIC_BODY_LIMIT + 1, ' ');

    const result = await sendRaw(
      port,
      'POST',
      '/api/products/with-templates',
      [body],
      true,
    );

    expect(result.status).toBe(413);
    expect(result.body).not.toContain('PayloadTooLargeError');
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it('rejects an over-limit chunked Unicode-escape body without trusting Content-Length', async () => {
    const raw = `{"value":"${'\\u0061'.repeat(350_000)}"}`;
    const chunks = raw.match(/[\s\S]{1,65536}/g) || [];

    const result = await sendRaw(
      port,
      'PUT',
      '/api/products/product-1/with-templates',
      chunks,
      false,
    );

    expect(lastTransferEncoding).toBe('chunked');
    expect(result.status).toBe(413);
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it('applies the atomic limit to an uppercase POST path with a query and trailing slash', async () => {
    const body = '{}'.padEnd(ATOMIC_BODY_LIMIT + 1, ' ');

    const result = await sendRaw(
      port,
      'POST',
      '/API/PRODUCTS/WITH-TEMPLATES/?source=case-test',
      [body],
      true,
    );

    expect(result.status).toBe(413);
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it('applies the atomic limit to a mixed-case PUT path with chunked transfer and a query', async () => {
    const raw = `{"value":"${'\\u0061'.repeat(350_000)}"}`;
    const chunks = raw.match(/[\s\S]{1,65536}/g) || [];

    const result = await sendRaw(
      port,
      'PUT',
      '/Api/Products/Product-1/With-Templates?source=case-test',
      chunks,
      false,
    );

    expect(lastTransferEncoding).toBe('chunked');
    expect(result.status).toBe(413);
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it.each([
    ['unsupported content encoding', { 'content-encoding': 'x-unsupported' }],
    ['unsupported JSON charset', { 'content-type': 'application/json; charset=iso-8859-1' }],
  ])('returns a generic JSON 415 for %s without leaking stack paths', async (_label, headers) => {
    const result = await sendRaw(
      port,
      'POST',
      '/api/products/with-templates',
      ['{}'],
      true,
      headers,
    );

    expect(result.status).toBe(415);
    expect(result.headers['content-type']).toContain('application/json');
    expect(JSON.parse(result.body)).toEqual({ error: 'Unsupported request body' });
    expect(result.body).not.toMatch(/[A-Z]:\\/i);
    expect(result.body).not.toContain('productAtomicJsonMiddleware');
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it('applies the 2 MiB limit after gzip decompression', async () => {
    const compressed = gzipSync(Buffer.from(
      '{}'.padEnd(ATOMIC_BODY_LIMIT + 1, ' '),
      'utf8',
    ));

    const result = await sendRaw(
      port,
      'POST',
      '/api/products/with-templates',
      [compressed],
      true,
      { 'content-encoding': 'gzip' },
    );

    expect(result.status).toBe(413);
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it.each([
    ['POST' as const, '/api/products/product-1/templates'],
    ['PUT' as const, '/api/products/product-1/templates/link-1'],
    ['PUT' as const, '/api/products/product-1/templates/link-1/primary'],
    ['POST' as const, '/api/templates'],
    ['PUT' as const, '/api/templates/template-1'],
  ])('applies the 2 MiB raw limit to %s %s', async (method, path) => {
    const body = '{}'.padEnd(ATOMIC_BODY_LIMIT + 1, ' ');

    const result = await sendRaw(port, method, path, [body], true);

    expect(result.status).toBe(413);
    expect(atomicHandlerCalls).toBe(0);
  });

  it('returns generic JSON for a malformed percent-encoded atomic PUT id', async () => {
    const result = await sendRaw(
      port,
      'PUT',
      '/api/products/%E0%A4%A/with-templates',
      ['{}'],
      true,
    );

    expect(result.status).toBe(400);
    expect(result.headers['content-type']).toContain('application/json');
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid product request path' });
    expect(result.body).not.toContain('URIError');
    expect(result.body).not.toMatch(/[A-Z]:\\/i);
    expect(result.body).not.toContain('node_modules');
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });

  it('accepts an atomic raw body exactly at the 2 MiB boundary', async () => {
    const body = '{}'.padEnd(ATOMIC_BODY_LIMIT, ' ');

    const result = await sendRaw(
      port,
      'POST',
      '/api/products/with-templates',
      [body],
      true,
    );

    expect(result.status).toBe(200);
    expect(atomicHandlerCalls).toBe(1);
    expect(atomicTransactionCalls).toBe(1);
  });

  it('keeps the existing 100 MiB parser compatibility for non-atomic endpoints', async () => {
    const body = '{}'.padEnd(ATOMIC_BODY_LIMIT + 1024, ' ');

    const result = await sendRaw(port, 'POST', '/api/ordinary', [body], true);

    expect(result.status).toBe(200);
    expect(ordinaryHandlerCalls).toBe(1);
    expect(atomicHandlerCalls).toBe(0);
    expect(atomicTransactionCalls).toBe(0);
  });
});
