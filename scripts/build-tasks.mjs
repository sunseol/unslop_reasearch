// Prompt Bank(03_데이터와_평가/Prompt_Bank.md)의 과제 표를 data/tasks.jsonl로 변환한다.
// 사용: node scripts/build-tasks.mjs [--check]
//   --check: 파일을 쓰지 않고 파싱 결과만 검증한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { normalizeText } from './text.mjs';

const SOURCE = '03_데이터와_평가/Prompt_Bank.md';
const TARGET = 'data/tasks.jsonl';
const COMMON_BRIEF =
  '아래 상황에 맞는 한국어 문서를 작성해 주세요. 제시된 사실만 사용하고, 없는 수치·이름·기한은 만들지 마세요. 형식(문단, 목록, 제목)은 자유입니다. 분량 범위를 지켜 주세요.';
const EXPECTED = { report: 15, email: 10, marketing: 10, explainer: 10, technical: 5, personal: 5, free: 5 };

export function splitTopLevel(text, sep = ', ') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(current.trim());
      current = '';
      i += sep.length - 1;
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseLength(cell) {
  const m = cell.replace(/,/g, '').match(/(\d+)\s*~\s*(\d+)/);
  if (!m) throw new Error(`분량을 읽을 수 없다: ${cell}`);
  return { min: Number(m[1]), max: Number(m[2]), unit: 'chars' };
}

export function parseReaderPurpose(cell) {
  const idx = cell.indexOf('. ');
  if (idx === -1) return { reader: cell.trim(), purpose: '' };
  return { reader: cell.slice(0, idx).trim(), purpose: cell.slice(idx + 2).trim() };
}

export function buildBrief(task) {
  const facts = task.facts.length ? task.facts.map((f) => `- ${f}`).join('\n') : '- (제공 사실 없음. 주제와 독자에 맞게 자유롭게 씁니다.)';
  return normalizeText(
    `${COMMON_BRIEF}\n\n` +
      `상황: ${task.title}\n` +
      `독자: ${task.reader}\n` +
      `목적: ${task.purpose}\n` +
      `사용할 수 있는 사실:\n${facts}\n` +
      `분량: 공백 포함 ${task.length.min}~${task.length.max}자`,
  );
}

export function parsePromptBank(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tasks = [];
  let domain = null;
  for (const line of lines) {
    const heading = line.match(/^### .*\((\w+),\s*\d+개\)/);
    if (heading) {
      domain = heading[1];
      continue;
    }
    const row = line.match(/^\|\s*(task-\d{3})\s*\|(.+)\|\s*$/);
    if (!row) continue;
    if (!domain) throw new Error(`영역 제목 없이 과제 행이 나왔다: ${row[1]}`);
    const cells = row[2].split('|').map((c) => c.trim());
    if (cells.length !== 4) throw new Error(`${row[1]}: 열 수가 4가 아니다 (${cells.length})`);
    const [title, readerPurpose, factsCell, lengthCell] = cells;
    const { reader, purpose } = parseReaderPurpose(readerPurpose);
    const facts = /^주제/.test(factsCell) ? [] : splitTopLevel(factsCell);
    const task = {
      id: row[1],
      kind: 'task',
      track: 'controlled',
      brief_origin: 'authored',
      derived_from: null,
      domain,
      title,
      reader,
      purpose,
      facts,
      note: /^주제/.test(factsCell) ? factsCell : undefined,
      length: parseLength(lengthCell),
    };
    task.brief = buildBrief(task);
    tasks.push(task);
  }
  return tasks;
}

export function validateTasks(tasks) {
  const errors = [];
  const ids = new Set();
  const counts = {};
  for (const t of tasks) {
    if (ids.has(t.id)) errors.push(`중복 ID: ${t.id}`);
    ids.add(t.id);
    counts[t.domain] = (counts[t.domain] ?? 0) + 1;
    if (!t.reader) errors.push(`${t.id}: 독자가 없다`);
    if (!t.purpose) errors.push(`${t.id}: 목적이 없다`);
    if (!(t.domain in EXPECTED)) errors.push(`${t.id}: 알 수 없는 영역 ${t.domain}`);
  }
  for (const [domain, n] of Object.entries(EXPECTED)) {
    if ((counts[domain] ?? 0) !== n) errors.push(`영역 ${domain}: ${counts[domain] ?? 0}개 (기대 ${n}개)`);
  }
  if (tasks.length !== 60) errors.push(`과제 수 ${tasks.length}개 (기대 60개)`);
  return errors;
}

function main() {
  const check = process.argv.includes('--check');
  const tasks = parsePromptBank(readFileSync(SOURCE, 'utf8'));
  const errors = validateTasks(tasks);
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  if (check) {
    console.log(`Prompt Bank OK: ${tasks.length} tasks.`);
    return;
  }
  const createdAt = new Date().toISOString();
  // 통제 트랙만 다시 만든다. 병렬 트랙 등 다른 트랙의 과제는 그대로 보존한다.
  const existing = existsSync(TARGET)
    ? readFileSync(TARGET, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];
  const preserved = existing.filter((t) => t.track && t.track !== 'controlled');
  const lines = [...tasks.map((t) => ({ ...t, created_at: createdAt })), ...preserved].map((t) => JSON.stringify(t));
  if (!existsSync('data')) mkdirSync('data');
  writeFileSync(TARGET, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${tasks.length} controlled tasks (+${preserved.length} preserved) to ${TARGET}.`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('build-tasks.mjs')) {
  main();
}
