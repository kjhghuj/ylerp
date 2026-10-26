import { readFile } from 'node:fs/promises';

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) throw new Error('Usage: node scripts/compare-ui-performance.mjs baseline-performance.json candidate-performance.json');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
let regression = false;
for (const key of ['firstRenderMs', 'searchMs', 'dialogMs']) {
  const before = baseline.medians?.[key];
  const after = candidate.medians?.[key];
  if (!Number.isFinite(before) || before <= 0 || !Number.isFinite(after) || after < 0) throw new Error(`Invalid performance sample: ${key}`);
  const change = (after / before - 1) * 100;
  console.log(`${key}: ${before.toFixed(1)}ms -> ${after.toFixed(1)}ms (${change.toFixed(1)}%)`);
  if (change > 10) regression = true;
}
if (regression) {
  console.error('Performance regressed by more than 10%; investigate before release.');
  process.exitCode = 1;
}
