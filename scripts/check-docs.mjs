import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import MarkdownIt from 'markdown-it';

const ignored = new Set(['.git', 'node_modules', '_old']);
const markdown = new MarkdownIt({ html: true });

export function checkDocs(root) {
  root = path.resolve(root);
  const errors = [], files = [], docs = new Map(), registered = new Set();
  const fail = (location, message) => errors.push(`${path.relative(root, location)}: ${message}`);
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { fail(target, 'symbolic links are not supported'); continue; }
      if (entry.isDirectory() && !ignored.has(entry.name)) walk(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  walk(root);
  for (const index of files.filter(f => path.basename(f) === '_index.yaml')) {
    let data;
    try { data = YAML.parse(fs.readFileSync(index, 'utf8'), { uniqueKeys: true }); }
    catch (e) { fail(index, `invalid YAML: ${e.message}`); continue; }
    if (!data || Object.keys(data).some(k => k !== 'documents') || !Array.isArray(data.documents)) {
      fail(index, 'expected documents array'); continue;
    }
    for (const doc of data.documents) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { fail(index, 'invalid document entry'); continue; }
      const allowed = ['id', 'file', 'status', 'summary', 'depends_on', 'supersedes'];
      for (const key of Object.keys(doc)) if (!allowed.includes(key)) fail(index, `unknown field: ${key}`);
      if (typeof doc.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(doc.id)) {
        fail(index, 'invalid document id'); continue;
      }
      if (docs.has(doc.id)) fail(index, `duplicate id: ${doc.id}`);
      else docs.set(doc.id, { ...doc, index });
      if (!['draft', 'active', 'retired'].includes(doc.status)) fail(index, `${doc.id}: invalid status`);
      if (typeof doc.summary !== 'string' || !doc.summary.trim()) fail(index, `${doc.id}: summary required`);
      for (const relation of ['depends_on', 'supersedes']) {
        const value = doc[relation];
        if (relation === 'supersedes' && value === undefined) continue;
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string') || new Set(value).size !== value.length)
          fail(index, `${doc.id}: ${relation} must be a unique list of IDs`);
      }
      const pattern = doc.status === 'retired' ? /^_old\/[^/\\]+\.md$/ : /^[^/\\]+\.md$/;
      if (typeof doc.file !== 'string' || !pattern.test(doc.file) || /[:\x00-\x1f]/.test(doc.file)) {
        fail(index, `${doc.id}: invalid file path`); continue;
      }
      const target = path.resolve(path.dirname(index), doc.file);
      if (registered.has(target)) fail(index, `duplicate file: ${doc.file}`);
      registered.add(target);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(index, `missing file: ${doc.file}`);
    }
  }
  for (const doc of docs.values()) {
    for (const relation of ['depends_on', 'supersedes']) {
      if (!Array.isArray(doc[relation])) continue;
      for (const id of doc[relation]) {
        const target = docs.get(id);
        if (!target) fail(doc.index, `${doc.id}: unknown reference ${id}`);
        else if (id === doc.id) fail(doc.index, `${doc.id}: self reference`);
        else if (relation === 'depends_on' && doc.status !== 'retired' && target.status === 'retired')
          fail(doc.index, `${doc.id}: depends on retired document ${id}`);
        else if (relation === 'supersedes' && target.status !== 'retired')
          fail(doc.index, `${doc.id}: superseded document ${id} must be retired`);
      }
    }
  }
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) { fail(docs.get(id).index, `relationship cycle at ${id}`); return; }
    if (visited.has(id)) return;
    const doc = docs.get(id);
    visiting.add(id);
    for (const field of ['depends_on', 'supersedes']) {
      if (Array.isArray(doc[field])) for (const next of doc[field]) if (docs.has(next)) visit(next);
    }
    visiting.delete(id); visited.add(id);
  }
  for (const id of docs.keys()) visit(id);
  function inspectTokens(tokens, file) {
    for (const token of tokens) {
      if (token.type === 'html_block' || token.type === 'html_inline') fail(file, 'use Markdown links instead of raw HTML');
      if (token.type === 'link_open' || token.type === 'image') {
        const href = token.attrGet(token.type === 'image' ? 'src' : 'href') || '';
        if (href && !href.startsWith('#') && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
          let relative;
          try { relative = decodeURIComponent(href.split(/[?#]/)[0]); }
          catch { fail(file, `invalid link encoding: ${href}`); continue; }
          const target = path.resolve(path.dirname(file), relative);
          const fromRoot = path.relative(root, target);
          if (relative.startsWith('/') || relative.includes('\\') || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot))
            fail(file, `link must stay inside repository: ${href}`);
          else if (!fs.existsSync(target)) fail(file, `broken link: ${href}`);
        }
      }
      if (token.children) inspectTokens(token.children, file);
    }
  }
  for (const file of files.filter(f => f.endsWith('.md'))) {
    if (!registered.has(file)) fail(file, 'Markdown is not registered in its folder index');
    inspectTokens(markdown.parse(fs.readFileSync(file, 'utf8'), {}), file);
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkDocs(process.argv[2] || process.cwd());
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Document checks passed.');
}
