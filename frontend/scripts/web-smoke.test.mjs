import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

async function runSmoke(overrides = {}) {
  const routes = {
    '/': [200, 'text/html', '<div id="root"></div><script type="module" src="/assets/app.js"></script><link href="/assets/app.css" rel="stylesheet">'],
    '/assets/app.js': [200, 'application/javascript', 'console.log("ok")'],
    '/assets/app.css': [200, 'text/css', 'body{color:blue}'],
    '/assets/lazy.js': [200, 'application/javascript', 'export const loaded=true;'],
    '/api/auth/me': [401, 'application/json', '{"error":"unauthorized"}'],
    ...overrides,
  };
  const server = createServer((request, response) => {
    const [status, type, content] = routes[request.url] || [404, 'text/plain', 'missing'];
    response.writeHead(status, { 'Content-Type': type });
    response.end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const process = spawn(globalThis.process.execPath, ['scripts/web-smoke.mjs'], {
        env: { ...globalThis.process.env, WEB_SMOKE_BASE: `http://127.0.0.1:${server.address().port}`, WEB_ASSETS: '/assets/lazy.js' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      process.stdout.on('data', chunk => { output += chunk; });
      process.stderr.on('data', chunk => { output += chunk; });
      process.on('error', reject);
      process.on('exit', code => resolve({ code, output }));
    });
    return result;
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('read-only smoke checks the application, lazy assets and auth proxy', async () => {
  const result = await runSmoke();
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /3 JS\/CSS assets/);
});
test('rejects a missing lazy chunk instead of accepting entry HTML only', async () => {
  const result = await runSmoke({ '/assets/lazy.js': [404, 'text/plain', 'missing'] });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /HTTP 404/);
});
test('rejects the SPA fallback returned for a missing asset', async () => {
  const result = await runSmoke({ '/assets/app.js': [200, 'text/html', '<!DOCTYPE html>'] });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Content-Type/);
});
test('rejects an application shell that has no React root', async () => {
  const result = await runSmoke({ '/': [200, 'text/html', '<p>Wrong site</p>'] });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Application shell is missing/);
});
test('rejects a broken API proxy without making any write requests', async () => {
  const result = await runSmoke({ '/api/auth/me': [502, 'text/plain', 'bad gateway'] });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /expected 401, received 502/);
});
