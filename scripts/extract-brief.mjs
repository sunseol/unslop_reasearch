// 병렬 트랙: Wild Human 문서에서 brief(독자·목적·사실 목록·분량)를 추출해 data/tasks.jsonl에 과제로 덧붙인다.
// 규칙은 03_데이터와_평가/병렬_말뭉치_계획.md의 'brief 추출 규칙'을 따른다. 결과는 review_status: pending이며
// 사람이 검토·승인하기 전에는 Gold 제작에 쓰지 않는다.
//
// 사용: node scripts/extract-brief.mjs [--model gpt-5.5] [--effort medium] [--concurrency 4] [--docs doc-0241,doc-0242] [--limit N]
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildBrief } from './build-tasks.mjs';

const TASKS = 'data/tasks.jsonl';
const DOCS = 'data/documents.jsonl';
const SCHEMA = resolve('scripts/brief-schema.json');
const LOG = 'data/private/extract.log';

const INSTRUCTION = `아래 문서를 읽고, 이 문서를 다시 쓰게 할 작성 과제(brief)를 JSON으로 만드세요. 도구나 파일은 사용하지 마세요.

규칙:
- 넣는 것: 대상 독자, 문서 목적, 사실 목록. 사실은 수치·날짜·대상·조건·결정 사항을 한 문장씩 나열합니다. 원문의 순서를 따르지 않아도 됩니다.
- 넣지 않는 것: 문단 구성, 제목 유무, 목록 사용 여부, 문장 순서, 원문의 표현·강조점·어조, "정중하게"·"간결하게" 같은 문체 지시.
- 원문에 없는 사실을 만들지 마세요. 원문이 근거 없이 주장한 내용은 "원문의 주장: "으로 시작하는 항목으로 구분하세요.
- 독자와 목적을 원문에서 직접 확인할 수 없으면 문서 유형과 게재 위치에서 추정하고 reader_inferred를 true로 두세요.
- 사실 항목은 원문 문장을 그대로 복사하지 말고 내용만 옮기세요. 한 항목은 한 가지 사실만 담습니다.
- domain은 report(업무보고·기획), email, marketing, explainer(설명문·기사), technical(기술 문서·README), personal, free 중 하나입니다.`;

function parseArgs(argv) {
  const args = { model: 'gpt-5.5', effort: 'medium', concurrency: 4, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--model') args.model = next();
    else if (a === '--effort') args.effort = next();
    else if (a === '--concurrency') args.concurrency = Number(next());
    else if (a === '--docs') args.docs = next().split(',');
    else if (a === '--limit') args.limit = Number(next());
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function log(line) {
  const msg = `${new Date().toISOString()} ${line}`;
  console.log(msg);
  mkdirSync('data/private', { recursive: true });
  appendFileSync(LOG, `${msg}\n`);
}

// 병렬 트랙 과제 ID는 task-101부터 시작해 통제 트랙(task-001~060)과 구분한다.
function nextTaskId(tasks) {
  let n = Math.max(100, ...tasks.map((t) => Number(t.id.split('-')[1]) || 0));
  return () => `task-${String(++n).padStart(3, '0')}`;
}

// 결정적 셔플. 같은 문서에는 같은 순서가 나온다.
export function shuffleSeeded(items, seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.codePointAt(0)) >>> 0;
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function lengthRange(chars) {
  const round10 = (x) => Math.max(100, Math.round(x / 10) * 10);
  return { min: round10(chars * 0.7), max: round10(chars * 1.3), unit: 'chars' };
}

function runCodex({ model, effort, prompt, workDir, outFile }) {
  return new Promise((resolvePromise, reject) => {
    const args = [
      'exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '--color', 'never',
      '-C', workDir, '-m', model,
      '-c', `model_reasoning_effort="${effort}"`, '-c', 'mcp_servers={}', '-c', 'web_search="disabled"',
      '--output-schema', SCHEMA, '-o', outFile, '-',
    ];
    const child = spawn('codex', args, { shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`codex exit ${code}: ${stderr.slice(-300)}`));
      if (!existsSync(outFile)) return reject(new Error('출력 파일 없음'));
      resolvePromise(readFileSync(outFile, 'utf8'));
    });
    child.stdin.end(prompt, 'utf8');
  });
}

export function buildParallelTask({ id, doc, extracted, model, effort }) {
  const chars = Array.from(doc.text).length;
  const task = {
    id,
    kind: 'task',
    track: 'parallel',
    brief_origin: 'derived-from-human',
    derived_from: doc.id,
    domain: extracted.domain,
    title: doc.title ?? doc.id,
    reader: extracted.reader,
    reader_inferred: extracted.reader_inferred,
    purpose: extracted.purpose,
    facts: shuffleSeeded(extracted.facts, doc.id),
    length: lengthRange(chars),
    review_status: 'pending',
    extractor: { model, reasoning_effort: effort, tool: 'codex-cli', rules: '병렬_말뭉치_계획.md brief 추출 규칙' },
    created_at: new Date().toISOString(),
  };
  task.brief = buildBrief(task);
  return task;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tasks = readJsonl(TASKS);
  const derived = new Set(tasks.map((t) => t.derived_from).filter(Boolean));
  let docs = readJsonl(DOCS).filter((d) => d.source?.type === 'wild-human' && !derived.has(d.id));
  if (args.docs) docs = docs.filter((d) => args.docs.includes(d.id));
  const queue = docs.slice(0, args.limit);
  log(`대상 ${queue.length}건 (모델 ${args.model})`);
  const newId = nextTaskId(tasks);
  const workDir = join(tmpdir(), 'unslop-extract');
  mkdirSync(workDir, { recursive: true });
  let ok = 0;
  let failed = 0;

  async function worker(n) {
    while (queue.length) {
      const doc = queue.shift();
      const outFile = join(workDir, `${doc.id}__${n}.json`);
      const started = Date.now();
      try {
        const raw = await runCodex({ ...args, prompt: `${INSTRUCTION}\n\n<문서>\n${doc.text}\n</문서>`, workDir, outFile });
        const extracted = JSON.parse(raw);
        if (!Array.isArray(extracted.facts) || extracted.facts.length < 3) throw new Error('사실 목록 부족');
        const task = buildParallelTask({ id: newId(), doc, extracted, model: args.model, effort: args.effort });
        appendFileSync(TASKS, `${JSON.stringify(task)}\n`);
        ok += 1;
        log(`OK ${task.id} ← ${doc.id} ${task.domain} 사실 ${task.facts.length}개 ${Math.round((Date.now() - started) / 1000)}s | ${task.title}`);
      } catch (err) {
        failed += 1;
        log(`FAIL ${doc.id} ${err.message.replace(/\s+/g, ' ').slice(0, 300)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, (_, i) => worker(i)));
  log(`완료: 성공 ${ok}건, 실패 ${failed}건`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('extract-brief.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
