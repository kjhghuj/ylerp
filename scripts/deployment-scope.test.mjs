import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectScope, scopeFromGit } from './deployment-scope.mjs';

const compose = 'services:\n  api:\n    image: api:v1\n  web:\n    image: web:v1\n\nvolumes:\n  data:\n';
const select = (files, after = compose, before = compose) => selectScope({ historyAvailable: true, files, readBefore: () => before, readAfter: () => after });
test('the complete UI migration, including release tooling and web image changes, deploys web only', () => {
  assert.equal(select(['frontend/App.tsx', 'docs/ui.md', '.github/workflows/deploy-production.yml', 'scripts/deploy-production.sh', 'docker-compose.prod.yml'], compose.replace('web:v1', 'web:v2')), 'web');
});
test('backend, shared, unknown build inputs and non-web compose changes require full', () => {
  for (const file of ['backend/src/app.ts', 'shared/types.ts', 'package.json', '.dockerignore']) assert.equal(select([file]), 'full');
  assert.equal(select(['docker-compose.prod.yml'], compose.replace('api:v1', 'api:v2')), 'full');
  assert.equal(select(['docker-compose.prod.yml'], compose.replace('  data:', '  other:')), 'full');
  assert.equal(select(['docker-compose.prod.yml'], 'services: { web: {} }'), 'full');
  assert.equal(select(['docker-compose.prod.yml'], compose.replace('  web:', '  web: &web')), 'full');
});
test('manual override is explicit and validated', () => {
  for (const requestedScope of ['web', 'full']) assert.equal(selectScope({ eventName: 'workflow_dispatch', requestedScope }), requestedScope);
  assert.throws(() => selectScope({ eventName: 'workflow_dispatch', requestedScope: 'auto' }));
});
test('missing history, git errors or deleted compose fail closed', () => {
  assert.equal(scopeFromGit({ BASE_SHA: '0'.repeat(40) }), 'full');
  assert.equal(scopeFromGit({ BASE_SHA: 'a'.repeat(40) }, () => { throw new Error('missing'); }), 'full');
  assert.equal(scopeFromGit({ BASE_SHA: 'a'.repeat(40), TARGET_SHA: 'b'.repeat(40) }, args => {
    if (args[0] === 'diff') return 'docker-compose.prod.yml\n';
    if (args[0] === 'show') throw new Error('deleted');
    return '';
  }), 'full');
});
