// Runs read-only inside the existing API container; no browser credentials or writes.
const base = process.env.WEB_SMOKE_BASE || 'http://127.0.0.1';
const assetPaths = (process.env.WEB_ASSETS || '').split('\n').filter(Boolean);
const fetchChecked = async (path, kind) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (kind && !type.includes(kind)) throw new Error(`${path}: unexpected Content-Type ${type}`);
  return response.text();
};
const html = await fetchChecked('/', 'text/html');
if (!html.includes('id="root"') || !html.includes('type="module"')) throw new Error('Application shell is missing');
const linkedAssets = Array.from(html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g), match => match[1]);
const paths = [...new Set([...linkedAssets, ...assetPaths])];
if (!paths.some(path => path.endsWith('.js')) || !paths.some(path => path.endsWith('.css'))) throw new Error('Missing compiled JS/CSS');
for (const path of paths) {
  const content = await fetchChecked(path, path.endsWith('.css') ? 'text/css' : 'javascript');
  if (!content.trim() || content.trimStart().startsWith('<!DOCTYPE')) throw new Error(`${path}: empty asset or SPA fallback`);
}
// Read-only proxy check proves that Nginx still reaches the API; 401 is expected without credentials.
const auth = await fetch(new URL('/api/auth/me', base), { signal: AbortSignal.timeout(15_000) });
if (auth.status !== 401) throw new Error(`Read-only auth proxy smoke: expected 401, received ${auth.status}`);
console.log(`Web smoke passed: application shell, ${paths.length} JS/CSS assets, authentication proxy`);
