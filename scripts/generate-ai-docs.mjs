// data/tasks.jsonl의 과제를 codex CLI로 여러 모델에 입력해 AI Controlled 문서를 만든다.
// 결과는 data/documents.jsonl(비공개, .gitignore)에 덧붙인다. 같은 (task_id, model) 조합은 다시 만들지 않는다.
//
// 사용: node scripts/generate-ai-docs.mjs [--models a,b] [--tasks task-001,task-002] [--limit N]
//                                        [--concurrency 3] [--effort medium] [--dry-run]
// 기본 모델 목록은 data/models.json에서 읽는다.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeText } from './text.mjs';

const TASKS = 'data/tasks.jsonl';
const DOCS = 'data/documents.jsonl';
const MODELS = 'data/models.json';
const LOG = 'data/private/generate.log';

// 사람 작성자가 제출 양식에서 받는 안내에 해당하는 최소 지시. brief 자체는 바꾸지 않는다.
const WRAPPER =
  '당신은 아래 작성 요청을 받은 작성자입니다. 도구나 파일을 사용하지 말고, 요청된 문서 본문만 출력하세요. 머리말, 설명, 마무리 인사 같은 문서 밖의 말은 쓰지 마세요.';

const GENRE_BY_DOMAIN = {
  report: 'report',
  email: 'email',
  marketing: 'marketing',
  explainer: 'explainer',
  technical: 'manual',
  personal: 'other',
  free: 'other',
};

function parseArgs(argv) {
  const args = { concurrency: 3, effort: 'medium', limit: Infinity, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--models') args.models = next().split(',');
    else if (a === '--tasks') args.tasks = next().split(',');
    else if (a === '--track') args.track = next();
    else if (a === '--limit') args.limit = Number(next());
    else if (a === '--concurrency') args.concurrency = Number(next());
    else if (a === '--effort') args.effort = next();
    else if (a === '--dry-run') args.dryRun = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function nextDocId(docs) {
  const max = docs.reduce((m, d) => Math.max(m, Number((d.id ?? 'doc-0').split('-')[1]) || 0), 0);
  let n = max;
  return () => `doc-${String(++n).padStart(4, '0')}`;
}

function log(line) {
  const msg = `${new Date().toISOString()} ${line}`;
  console.log(msg);
  mkdirSync('data/private', { recursive: true });
  appendFileSync(LOG, `${msg}\n`);
}

export function runCodex({ model, prompt, effort, workDir, outFile }) {
  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '-s', 'read-only',
      '--color', 'never',
      '-C', workDir,
      '-m', model,
      '-c', `model_reasoning_effort="${effort}"`,
      '-c', 'mcp_servers={}',
      '-c', 'web_search="disabled"',
      '-o', outFile,
      '-',
    ];
    const child = spawn('codex', args, { shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`codex exit ${code}: ${stderr.slice(-500)}`));
      if (!existsSync(outFile)) return reject(new Error('codex가 출력 파일을 만들지 않았다'));
      resolve(readFileSync(outFile, 'utf8'));
    });
    child.stdin.end(prompt, 'utf8');
  });
}

export function buildRecord({ id, task, model, text, effort, codexVersion }) {
  const normalized = normalizeText(text);
  const chars = Array.from(normalized).length;
  return {
    id,
    kind: 'document',
    task_id: task.id,
    track: task.track ?? 'controlled',
    text: normalized,
    language: 'ko',
    genre: GENRE_BY_DOMAIN[task.domain] ?? 'other',
    source: {
      type: 'ai-controlled',
      model,
      model_version: null,
      prompt_id: task.id,
      sampling: { reasoning_effort: effort },
      tool: `codex-cli ${codexVersion}`,
      wrapper: WRAPPER,
      fictional: false,
    },
    license: 'internal-generated',
    collection_note: `codex exec로 생성. 분량 ${chars}자 (요구 ${task.length.min}~${task.length.max}자, ${chars >= task.length.min && chars <= task.length.max ? '충족' : '미충족'}).`,
    created_at: new Date().toISOString(),
  };
}

async function codexVersion() {
  return new Promise((resolve) => {
    const child = spawn('codex', ['--version'], { shell: process.platform === 'win32' });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out.trim().replace(/^codex-cli\s*/, '') || 'unknown'));
    child.on('error', () => resolve('unknown'));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelConfig = JSON.parse(readFileSync(MODELS, 'utf8'));
  const models = args.models ?? modelConfig.models.map((m) => m.id);
  let tasks = readJsonl(TASKS);
  if (args.tasks) tasks = tasks.filter((t) => args.tasks.includes(t.id));
  if (args.track) tasks = tasks.filter((t) => (t.track ?? 'controlled') === args.track);
  const docs = readJsonl(DOCS);
  const done = new Set(docs.filter((d) => d.source?.type === 'ai-controlled').map((d) => `${d.task_id}|${d.source.model}`));

  const jobs = [];
  for (const task of tasks) for (const model of models) {
    if (!done.has(`${task.id}|${model}`)) jobs.push({ task, model });
  }
  const queue = jobs.slice(0, args.limit);
  log(`대상 ${queue.length}건 (모델 ${models.length}종, 과제 ${tasks.length}개, 이미 생성 ${done.size}건)`);
  if (args.dryRun) {
    for (const j of queue) console.log(`${j.task.id} × ${j.model}`);
    return;
  }

  const version = await codexVersion();
  const newId = nextDocId(docs);
  const workDir = join(tmpdir(), 'unslop-gen');
  mkdirSync(workDir, { recursive: true });
  let ok = 0;
  let failed = 0;

  async function worker(n) {
    while (queue.length) {
      const { task, model } = queue.shift();
      const outFile = join(workDir, `${task.id}__${model.replace(/[^\w.-]/g, '_')}__${n}.txt`);
      const started = Date.now();
      try {
        const text = await runCodex({ model, prompt: `${WRAPPER}\n\n${task.brief}`, effort: args.effort, workDir, outFile });
        if (!text.trim()) throw new Error('빈 응답');
        const record = buildRecord({ id: newId(), task, model, text, effort: args.effort, codexVersion: version });
        appendFileSync(DOCS, `${JSON.stringify(record)}\n`);
        ok += 1;
        log(`OK ${record.id} ${task.id} ${model} ${Math.round((Date.now() - started) / 1000)}s ${record.collection_note}`);
      } catch (err) {
        failed += 1;
        log(`FAIL ${task.id} ${model} ${err.message.replace(/\s+/g, ' ').slice(0, 300)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, (_, i) => worker(i)));
  log(`완료: 성공 ${ok}건, 실패 ${failed}건`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('generate-ai-docs.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
