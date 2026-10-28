import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
// Reviewed pre-migration baseline; CI supplies its event base when available.
const base = process.env.UI_LINT_BASE && !/^0+$/.test(process.env.UI_LINT_BASE) ? process.env.UI_LINT_BASE : 'dd5bcde';
const files = [...new Set([...git(['diff', '--name-only', base, '--', 'frontend']), ...git(['ls-files', '--others', '--exclude-standard', 'frontend'])])]
  .filter(file => /^frontend\/(?:App\.tsx|components\/|modules\/|hooks\/|lib\/|__tests__\/|e2e\/)/.test(file) && /\.tsx?$/.test(file) && existsSync(path.join(root, file)))
  .map(file => file.replace(/^frontend\//, ''));
if (!files.length) console.log('No changed UI TypeScript sources.');
else {
  console.log(`Linting ${files.length} changed UI sources (including explicitly ignored modules).`);
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--no-ignore', ...files], { cwd: path.join(root, 'frontend'), stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
