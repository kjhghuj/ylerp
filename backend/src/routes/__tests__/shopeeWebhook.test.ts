import { createHmac } from 'crypto';
import express from 'express';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import http, { Server } from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { configureJsonBodyParsing } from '../../middleware/productAtomicJsonMiddleware';
import shopeeRoutes from '../shopeeRoutes';

const callbackUrl = 'https://shopee-test.example/api/shopee/webhook';
const testKey = 'local-unit-test-push-key';
const sign = (body: string | Buffer, url = callbackUrl) => createHmac('sha256', testKey)
  .update(url).update('|').update(body).digest('hex');

describe('Shopee push HTTP receiver', () => {
  const originalEnv = process.env;
  let server: Server;
  let port: number;
  let inbox: string;

  beforeEach(async () => {
    inbox = await mkdtemp(path.join(os.tmpdir(), 'shopee-webhook-test-'));
    process.env = {
      ...originalEnv,
      SHOPEE_PUSH_PARTNER_KEY: testKey,
      SHOPEE_WEBHOOK_URL: callbackUrl,
      SHOPEE_PUSH_INBOX_DIR: inbox,
      SHOPEE_PUSH_DIAGNOSTICS: '0',
    };
    const app = express();
    app.use('/api/shopee', shopeeRoutes);
    configureJsonBodyParsing(app);
    app.post('/api/ordinary', (req, res) => res.json(req.body));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    process.env = originalEnv;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (inbox) await rm(inbox, { recursive: true, force: true });
  });

  const post = (body: string | Buffer, headers: Record<string, string> = {}, route = '/api/shopee/webhook') => (
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1', port, path: route, method: 'POST',
        headers: { 'content-type': 'application/json', authorization: sign(body), ...headers },
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve({
          status: response.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      request.on('error', reject);
      request.end(body);
    })
  );

  it('accepts signed raw JSON including whitespace and Unicode; persists before empty 200', async () => {
    const body = '{ "code": 3, "shop_id": 123, "data": { "name": "测试" } }\n';
    expect(await post(body)).toEqual({ status: 200, body: '' });
    const files = await readdir(inbox);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
    expect(await readFile(path.join(inbox, files[0]), 'utf8')).toBe(body);
  });

  it('deduplicates concurrent retries into one complete notification', async () => {
    const body = '{"code":3,"shop_id":123}';
    const results = await Promise.all([post(body), post(body), post(body)]);
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(await readdir(inbox)).toHaveLength(1);
  });

  it.each(['', 'bad-signature', 'a'.repeat(64)])('rejects invalid Authorization without saving: %s', async signature => {
    expect((await post('{}', { authorization: signature })).status).toBe(401);
    expect(await readdir(inbox)).toEqual([]);
  });

  it('rejects a body changed after signing', async () => {
    expect((await post('{"shop_id":2}', { authorization: sign('{"shop_id":1}') })).status).toBe(401);
  });

  it('binds verification to the configured public URL, not forwarded headers', async () => {
    const body = '{}';
    expect((await post(body, {
      authorization: sign(body, 'https://attacker.example/api/shopee/webhook'),
      host: 'attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https',
    })).status).toBe(401);
    expect((await post(body, { host: 'localhost', 'x-forwarded-host': 'attacker.example' })).status).toBe(200);
  });

  it.each(['SHOPEE_PUSH_PARTNER_KEY', 'SHOPEE_WEBHOOK_URL'])('fails closed without %s', async setting => {
    delete process.env[setting];
    expect((await post('{}')).status).toBe(503);
    expect(await readdir(inbox)).toEqual([]);
  });

  it.each(['{', 'null', '[]', '42'])('rejects malformed or non-object JSON: %s', async body => {
    expect((await post(body)).status).toBe(400);
    expect(await readdir(inbox)).toEqual([]);
  });

  it('bounds raw body size independently of the general 100 MB parser', async () => {
    const body = JSON.stringify({ data: 'a'.repeat(256 * 1024) });
    expect((await post(body)).status).toBe(413);
    expect(await readdir(inbox)).toEqual([]);
  });

  it('rejects unsupported content types and compressed bodies', async () => {
    expect((await post('{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(gzipSync('{}'), { 'content-encoding': 'gzip' })).status).toBe(415);
  });

  it('returns a retryable error if persistence fails, without leaking paths', async () => {
    const blockedPath = path.join(inbox, 'not-a-directory');
    await writeFile(blockedPath, 'blocked');
    process.env.SHOPEE_PUSH_INBOX_DIR = blockedPath;
    const response = await post('{}');
    expect(response.status).toBe(503);
    expect(response.body).not.toContain(inbox);
  });

  it('preserves JSON parsing for ordinary application routes', async () => {
    expect(await post('{"ok":true}', {}, '/api/ordinary')).toEqual({ status: 200, body: '{"ok":true}' });
  });

  it('records a bounded diagnosis without logging signatures, query strings, or body data', async () => {
    process.env.SHOPEE_PUSH_DIAGNOSTICS = '1';
    const diagnosticPath = path.join(inbox, 'diagnostics.json');
    process.env.SHOPEE_PUSH_DIAGNOSTICS_FILE = diagnosticPath;
    const privateBody = '{"buyer":"private-buyer-detail"}';
    const badSignature = 'b'.repeat(64);
    for (let index = 0; index < 22; index++) {
      expect((await post(privateBody, { authorization: badSignature }, '/api/shopee/webhook?secret=private-query')).status).toBe(401);
    }
    const contents = await readFile(diagnosticPath, 'utf8');
    const records = JSON.parse(contents);
    expect(records).toHaveLength(20);
    expect(records[19]).toMatchObject({ status: 401, reason: 'signature_mismatch', signatureFormat: 'hex64', contentType: 'json' });
    expect(contents).not.toContain(badSignature);
    expect(contents).not.toContain(testKey);
    expect(contents).not.toContain('private-buyer-detail');
    expect(contents).not.toContain('private-query');
  });
});
