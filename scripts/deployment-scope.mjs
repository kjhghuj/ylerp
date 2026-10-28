import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// This intentionally accepts only our conventional, two-space Compose service layout.
// Unknown layouts fail closed to a full deployment rather than hiding API changes.
export function withoutWeb(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!/^services:\s*$/m.test(normalized) || /\t/.test(normalized) || /[&*][a-zA-Z_]/.test(normalized)) return null;
  const lines = normalized.split('\n');
  const starts = lines.flatMap((line, index) => /^  web:\s*$/.test(line) ? [index] : []);
  if (starts.length !== 1) return null;
  const start = starts[0];
  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || /^\s{4}/.test(lines[end]) || /^\s*#/.test(lines[end]))) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

export function selectScope({ eventName, requestedScope, historyAvailable, files = [], readBefore, readAfter }) {
  if (eventName === 'workflow_dispatch') {
    if (!['web', 'full'].includes(requestedScope)) throw new Error('Invalid manual deployment scope');
    return requestedScope;
  }
  if (!historyAvailable) return 'full';
  for (const file of files) {
    if (/^(backend\/|shared\/|deploy\.sh$|\.dockerignore$)/.test(file)) return 'full';
    if (/^docker-compose/.test(file)) {
      const before = withoutWeb(readBefore(file));
      const after = withoutWeb(readAfter(file));
      if (before === null || after === null || before !== after) return 'full';
    } else if (!/^(frontend\/|docs\/|\.github\/|scripts\/|README(?:\.|$)|LICENSE(?:\.|$)|\.gitignore$)/.test(file)) {
      // Unrecognized root/build inputs may affect the API image.
      return 'full';
    }
  }
  return 'web';
}

export function scopeFromGit(env = process.env, git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) {
  const { EVENT_NAME: eventName, REQUESTED_SCOPE: requestedScope, BASE_SHA: base, TARGET_SHA: target } = env;
  if (eventName === 'workflow_dispatch') return selectScope({ eventName, requestedScope });
  if (!/^[a-f0-9]{40}$/.test(base || '') || /^0+$/.test(base)) return 'full';
  try {
    git(['cat-file', '-e', `${base}^{commit}`]);
    const files = git(['diff', '--name-only', base, target]).trim().split('\n').filter(Boolean);
    return selectScope({ historyAvailable: true, files, readBefore: file => git(['show', `${base}:${file}`]), readAfter: file => git(['show', `${target}:${file}`]) });
  } catch { return 'full'; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = scopeFromGit();
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
  else process.stdout.write(`${scope}\n`);
}
