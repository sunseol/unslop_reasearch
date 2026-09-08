import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { checkDocs } from './check-docs.mjs';

function fixture(t, documents, body = '# Test\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unslop-docs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '_index.yaml'), YAML.stringify({ documents }));
  fs.writeFileSync(path.join(root, 'a.md'), body);
  return root;
}
const doc = (extra = {}) => ({ id: 'test-001', file: 'a.md', status: 'active', summary: 'Test', depends_on: [], ...extra });

test('valid documents support reference links, encoded paths and archived history', t => {
  const root = fixture(t, [doc()], '[file][ref]\n\n[ref]: assets/hello%20world.txt\n\n```md\n[ignored](missing.md)\n```');
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'hello world.txt'), 'ok');
  fs.mkdirSync(path.join(root, '_old'));
  fs.writeFileSync(path.join(root, '_old', 'history.md'), '[old](missing.md)');
  assert.deepEqual(checkDocs(root), []);
});
test('reports duplicate IDs, unknown references and missing documents', t => {
  const root = fixture(t, [doc({ depends_on: ['unknown'] }), doc({ file: 'missing.md' })]);
  const errors = checkDocs(root).join('\n');
  for (const expected of ['duplicate id', 'unknown reference', 'missing file']) assert.ok(errors.includes(expected));
});
test('reports unregistered documents and broken links', t => {
  const root = fixture(t, [], '[broken](missing.md)\n![image](missing.png)');
  const errors = checkDocs(root).join('\n');
  assert.match(errors, /not registered/);
  assert.match(errors, /broken link: missing.md/);
  assert.match(errors, /broken link: missing.png/);
});
test('rejects malformed YAML', t => {
  const root = fixture(t, [doc()]);
  fs.writeFileSync(path.join(root, '_index.yaml'), 'documents: [');
  assert.match(checkDocs(root).join('\n'), /invalid YAML/);
});
test('reports cycles and dependencies on retired documents', t => {
  const root = fixture(t, [doc({ depends_on: ['test-002'] }), doc({ id: 'test-002', file: '_old/b.md', status: 'retired', depends_on: ['test-001'] })]);
  fs.mkdirSync(path.join(root, '_old'));
  fs.writeFileSync(path.join(root, '_old', 'b.md'), '# Archived');
  const errors = checkDocs(root).join('\n');
  assert.match(errors, /depends on retired/);
  assert.match(errors, /relationship cycle/);
});
test('replacement resolves to an archived retired document', t => {
  const root = fixture(t, [doc({ supersedes: ['test-002'] }), doc({ id: 'test-002', file: '_old/b.md', status: 'retired' })]);
  fs.mkdirSync(path.join(root, '_old'));
  fs.writeFileSync(path.join(root, '_old', 'b.md'), '# Archived');
  assert.deepEqual(checkDocs(root), []);
});
test('rejects escaping paths and links', t => {
  const root = fixture(t, [doc({ file: '../a.md' })], '[outside](../outside.md)');
  const errors = checkDocs(root).join('\n');
  assert.match(errors, /invalid file path/);
  assert.match(errors, /link must stay inside/);
});
test('nested folder indexes resolve global IDs', t => {
  const root = fixture(t, [doc()]);
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'b.md'), '[parent](../a.md)');
  fs.writeFileSync(path.join(nested, '_index.yaml'), YAML.stringify({ documents: [doc({ id: 'test-002', file: 'b.md', depends_on: ['test-001'] })] }));
  assert.deepEqual(checkDocs(root), []);
});
test('raw HTML is rejected rather than silently skipping its links', t => {
  const root = fixture(t, [doc()], '<a href="missing.md">link</a>');
  assert.match(checkDocs(root).join('\n'), /raw HTML/);
});
