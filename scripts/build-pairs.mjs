// Challenge에 제시할 문서 쌍(data/pairs.jsonl)을 만든다. 같은 과제의 문서 2개를 묶는다.
// 규칙:
//   - 오염 판정된 AI 문서는 제외한다.
//   - 두 문서의 글자 수 비율이 --max-ratio(기본 2.0)를 넘으면 제외한다. 분량 차이가 작성 주체의 단서가 되기 때문이다.
//   - human-ai 쌍을 우선 만들고, ai-ai 쌍은 과제당 --ai-ai-per-task(기본 1)개, human-human 쌍은 있는 만큼 만든다.
//   - pairs.jsonl에는 문서 ID와 트랙만 들어가고 작성 주체는 들어가지 않는다. pair_kind는 별도 비공개 파일에 둔다.
//
// 사용: node scripts/build-pairs.mjs [--max-ratio 2.0] [--ai-ai-per-task 1] [--include-pending]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const DOCS = 'data/documents.jsonl';
const TASKS = 'data/tasks.jsonl';
const PAIRS = 'data/pairs.jsonl';
const PAIR_KINDS = 'data/private/pair_kinds.jsonl';

function parseArgs(argv) {
  const args = { maxRatio: 2.0, aiAiPerTask: 1, includePending: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--max-ratio') args.maxRatio = Number(argv[++i]);
    else if (a === '--ai-ai-per-task') args.aiAiPerTask = Number(argv[++i]);
    else if (a === '--include-pending') args.includePending = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const isHuman = (d) => d.source?.type === 'human-controlled' || d.source?.type === 'wild-human';
const isAi = (d) => d.source?.type === 'ai-controlled';

export function lengthRatio(a, b) {
  const x = Array.from(a.text).length;
  const y = Array.from(b.text).length;
  return Math.max(x, y) / Math.max(1, Math.min(x, y));
}

// 결정적 순서로 섞어 ai-ai 쌍 선택이 실행마다 같게 한다.
function seededOrder(items, seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.codePointAt(0)) >>> 0;
  return items
    .map((it) => { s = (s * 1103515245 + 12345) >>> 0; return { it, k: s }; })
    .sort((a, b) => a.k - b.k)
    .map((x) => x.it);
}

export function buildPairs(docs, tasks, args) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const byTask = new Map();
  for (const d of docs) {
    if (!d.task_id) continue;
    const t = taskById.get(d.task_id);
    if (!t) continue;
    if (t.track === 'parallel' && t.review_status !== 'approved' && !args.includePending) continue;
    if (d.contamination?.contaminated) continue;
    (byTask.get(d.task_id) ?? byTask.set(d.task_id, []).get(d.task_id)).push(d);
  }
  // 병렬 트랙에서는 brief의 원천 문서를 사람 문서로 포함한다.
  const docById = new Map(docs.map((d) => [d.id, d]));
  for (const [taskId, list] of byTask) {
    const t = taskById.get(taskId);
    if (t.track === 'parallel' && t.derived_from && docById.has(t.derived_from) && !list.some((d) => d.id === t.derived_from)) {
      list.push(docById.get(t.derived_from));
    }
  }

  const pairs = [];
  const kinds = [];
  let n = 0;
  const excluded = { ratio: 0 };
  const push = (taskId, a, b, kind, track) => {
    if (lengthRatio(a, b) > args.maxRatio) { excluded.ratio += 1; return; }
    const id = `pair-${String(++n).padStart(4, '0')}`;
    pairs.push({ id, kind: 'pair', task_id: taskId, document_ids: [a.id, b.id], track, created_at: new Date().toISOString() });
    kinds.push({ pair_id: id, pair_kind: kind });
  };

  for (const [taskId, list] of [...byTask.entries()].sort()) {
    const track = taskById.get(taskId).track ?? 'controlled';
    const humans = list.filter(isHuman);
    const ais = list.filter(isAi);
    for (const h of humans) for (const a of ais) push(taskId, h, a, 'human-ai', track);
    for (let i = 0; i < humans.length; i += 1) for (let j = i + 1; j < humans.length; j += 1) push(taskId, humans[i], humans[j], 'human-human', track);
    const aiPairs = [];
    for (let i = 0; i < ais.length; i += 1) for (let j = i + 1; j < ais.length; j += 1) aiPairs.push([ais[i], ais[j]]);
    for (const [a, b] of seededOrder(aiPairs, taskId).slice(0, args.aiAiPerTask)) push(taskId, a, b, 'ai-ai', track);
  }
  return { pairs, kinds, excluded };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docs = readJsonl(DOCS);
  const tasks = readJsonl(TASKS);
  const { pairs, kinds, excluded } = buildPairs(docs, tasks, args);
  mkdirSync('data/private', { recursive: true });
  writeFileSync(PAIRS, `${pairs.map((p) => JSON.stringify(p)).join('\n')}\n`);
  writeFileSync(PAIR_KINDS, `${kinds.map((k) => JSON.stringify(k)).join('\n')}\n`);
  const count = {};
  for (const k of kinds) count[k.pair_kind] = (count[k.pair_kind] ?? 0) + 1;
  const byTrack = {};
  for (const p of pairs) byTrack[p.track] = (byTrack[p.track] ?? 0) + 1;
  console.log(`쌍 ${pairs.length}개 (분량 비율 초과로 제외 ${excluded.ratio}개)`);
  console.log('종류별', count);
  console.log('트랙별', byTrack);
}

if (process.argv[1]?.endsWith('build-pairs.mjs')) main();
