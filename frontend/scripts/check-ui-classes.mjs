import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const invalid = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(?:tsx?|css)$/.test(entry.name)) {
      const lines = (await readFile(file, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        if (/\b(?:bg|text|border|ring|fill|stroke)-[\w-]+\/\d+\/\d+\b/.test(line)) invalid.push(`${path.relative(root, file)}:${index + 1}`);
      });
    }
  }
}
await Promise.all(['components', 'modules'].map(directory => scan(path.join(root, directory))));
if (invalid.length) {
  console.error(`Invalid repeated Tailwind opacity modifiers:\n${invalid.join('\n')}`);
  process.exitCode = 1;
} else console.log('UI class guard passed.');
