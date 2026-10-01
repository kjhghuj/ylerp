import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ERP_API_BASE, ERP_PRODUCTION_API_BASE, normalizeApiBase} from '../config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['config.mjs', 'core.mjs', 'api.mjs', 'capture.mjs', 'controller.mjs', 'service-worker.mjs',
  'popup.html', 'popup.mjs', 'popup.css', 'README.md'];

export function buildManifest(apiBase = ERP_API_BASE) {
  const erpHosts = [apiBase, ERP_PRODUCTION_API_BASE].map(base => {
    const url = new URL(normalizeApiBase(base));
    return `${url.protocol}//${url.hostname}/*`;
  });
  return {
    manifest_version: 3, minimum_chrome_version: '120', name: '阳零 ERP · Shopee 凭据同步', version: '1.0.5',
    description: '登录 ERP 后，一键同步当前浏览器的 Shopee Cookie 和 SPC_CDS，所有店铺共用。',
    incognito: 'not_allowed', permissions: ['cookies', 'storage', 'webRequest'],
    // Cookie API 按 Secure 属性检查 HTTPS/HTTP 来源；两种来源都需要权限。
    host_permissions: ['*://seller.shopee.cn/*', '*://shopee.cn/*', ...new Set(erpHosts)],
    background: {service_worker: 'service-worker.mjs', type: 'module'},
    action: {default_popup: 'popup.html', default_title: '同步 Shopee 凭据到 ERP'},
    content_security_policy: {extension_pages: "script-src 'self'; object-src 'none';"},
  };
}

// ZIP 存储格式，不依赖第三方打包库；按白名单打包，避免混入测试或个人配置。
function zip(entries) {
  const table = Array.from({length: 256}, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  const local = [], central = [];
  let offset = 0;
  for (const [name, body] of entries) {
    const filename = Buffer.from(name, 'utf8');
    let crc = 0xffffffff;
    for (const byte of body) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, body);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(0x21, 14); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(body.length, 20); directory.writeUInt32LE(body.length, 24);
    directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + body.length;
  }
  const directorySize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export async function build({apiBase = ERP_API_BASE, output = path.join(root, 'dist')} = {}) {
  const normalized = normalizeApiBase(apiBase);
  const manifest = buildManifest(normalized);
  const entries = [['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')]];
  for (const name of files) {
    let data = await fs.readFile(path.join(root, name));
    if (name === 'config.mjs') data = Buffer.from(data.toString().replace(
      /export const ERP_API_BASE = '[^']+';/, `export const ERP_API_BASE = ${JSON.stringify(normalized)};`));
    entries.push([name, data]);
  }
  const unpacked = path.join(output, 'unpacked');
  await fs.mkdir(unpacked, {recursive: true});
  for (const [name, data] of entries) await fs.writeFile(path.join(unpacked, name), data);
  const archive = path.join(output, 'shopee-cookie-sync.zip');
  await fs.writeFile(archive, zip(entries));
  return {unpacked, archive, manifest};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.indexOf('--api-base');
  if (arg >= 0 && !process.argv[arg + 1]) throw new Error('--api-base 后需要提供 ERP API 地址');
  const result = await build({apiBase: arg >= 0 ? process.argv[arg + 1] : ERP_API_BASE});
  console.log(`可加载目录：${result.unpacked}\nZIP 安装包：${result.archive}`);
}
