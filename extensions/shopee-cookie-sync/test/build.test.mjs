import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, buildManifest } from '../scripts/build.mjs';
import { normalizeApiBase } from '../config.mjs';
import { CaptureManager } from '../capture.mjs';
import { MemoryStorage, cookie, cookieApi, request } from './fixtures.mjs';

test('Shopee 权限覆盖非 Secure Cookie 的 HTTP 来源，避免 HTTPS 请求的 Cookie 读漏', async () => {
  const manifest = buildManifest();
  // Chromium 按 Cookie 自身的 Secure 属性构造来源 URL 后检查扩展权限。
  // 因此 HTTPS 页面发送的普通 Cookie 仍需要 HTTP 来源的读取权限。
  const readable = item => {
    const origin = new URL(`${item.secure ? 'https' : 'http'}://${item.domain.replace(/^\./, '')}/`);
    return manifest.host_permissions.some(pattern => {
      const host = new URL(pattern.replace(/^\*:/, 'http:'));
      return host.hostname === origin.hostname &&
        (pattern.startsWith('*://') || host.protocol === origin.protocol);
    });
  };
  const values = [cookie(), cookie({name: 'SPC_CDS', value: 'fixture-cds', secure: false})];
  const cookies = cookieApi(values);
  cookies.getAll = async () => values.filter(readable);
  const capture = new CaptureManager({session: new MemoryStorage(), cookies});
  assert.equal(await capture.capture(request({requestHeaders: [{name: 'Cookie',
    value: 'SPC_EC=fixture-session; SPC_CDS=fixture-cds'}]})), true);
  const payload = await capture.uploadPayload();
  assert.equal(payload.cookies.find(item => item.name === 'SPC_CDS').secure, false);
  assert.equal(readable(cookie({domain: '.example.com', secure: false})), false);
  assert.equal(readable(cookie({domain: 'other.shopee.cn', secure: false})), false);
});

test('Manifest 包含两种环境的明确域名权限，拒绝未配置的远程 HTTP 和含秘密的地址', () => {
  const manifest = buildManifest('https://erp.example.com/api');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.incognito, 'not_allowed');
  assert.deepEqual(manifest.permissions, ['cookies', 'storage', 'webRequest']);
  assert.ok(manifest.host_permissions.includes('https://erp.example.com/*'));
  assert.ok(manifest.host_permissions.includes('http://39.97.246.43/*'));
  assert.equal(manifest.host_permissions.some((host) => host.includes('localhost')), false);
  assert.ok(buildManifest('http://localhost:4022/api').host_permissions.includes('http://localhost/*'));
  assert.equal(normalizeApiBase('http://39.97.246.43/api'), 'http://39.97.246.43/api');
  assert.equal(normalizeApiBase('https://erp.example.com/api/'), 'https://erp.example.com/api');
  for (const base of ['http://erp.example.com/api', 'http://39.97.246.43:8080/api', 'http://39.97.246.44/api', 'https://u:p@erp.example.com/api', 'http://u:p@39.97.246.43/api', 'https://erp.example.com/api?token=secret', 'file:///tmp/api']) {
    assert.throws(() => normalizeApiBase(base));
  }
});

test('生产包包含完整插件和中文说明，生成配置与域名权限同步更新', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'erp-extension-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const result = await build({ apiBase: 'https://erp.example.com/api', output });
  const manifest = JSON.parse(await readFile(join(output, 'unpacked', 'manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://erp.example.com/*'));
  assert.match(await readFile(join(output, 'unpacked', 'config.mjs'), 'utf8'), /ERP_API_BASE = ["']https:\/\/erp.example.com\/api["']/);
  assert.match(await readFile(join(output, 'unpacked', 'README.md'), 'utf8'), /加载已解压/);
  const zip = await readFile(join(output, 'shopee-cookie-sync.zip'));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.ok(result.manifest);
  assert.equal(zip.includes(Buffer.from('fixture-token')), false);
});
