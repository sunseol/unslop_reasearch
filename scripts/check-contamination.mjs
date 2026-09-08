// 병렬 트랙 오염 확인: AI 문서가 brief의 원천인 사람 문서를 그대로 재현했는지 본다.
// 문장 단위 일치 비율과 가장 긴 공통 부분 문자열 길이를 계산해 data/private/contamination.jsonl에 기록하고,
// 임계값을 넘는 문서에는 documents.jsonl의 해당 레코드에 contamination 필드를 써 넣는다.
//
// 사용: node scripts/check-contamination.mjs [--sentence-threshold 0.2] [--lcs-threshold 60] [--min-sentence 15]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const DOCS = 'data/documents.jsonl';
const TASKS = 'data/tasks.jsonl';
const REPORT = 'data/private/contamination.jsonl';

function parseArgs(argv) {
  const args = { sentenceThreshold: 0.2, lcsThreshold: 60, minSentence: 15 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => Number(argv[++i]);
    if (a === '--sentence-threshold') args.sentenceThreshold = next();
    else if (a === '--lcs-threshold') args.lcsThreshold = next();
    else if (a === '--min-sentence') args.minSentence = next();
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// 비교용 정규화: 공백·문장 부호·마크다운 기호를 제거한다.
export function canon(text) {
  return text.replace(/[\s\p{P}\p{S}]/gu, '');
}

export function splitSentences(text) {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// AI 문서 문장 중 사람 문서에 정규화 기준으로 그대로 들어 있는 문장의 비율.
export function sentenceOverlap(aiText, humanText, minSentence) {
  const human = canon(humanText);
  const sentences = splitSentences(aiText).map(canon).filter((s) => Array.from(s).length >= minSentence);
  if (!sentences.length) return { ratio: 0, matched: 0, total: 0 };
  const matched = sentences.filter((s) => human.includes(s)).length;
  return { ratio: matched / sentences.length, matched, total: sentences.length };
}

// 가장 긴 공통 부분 문자열 길이(코드 포인트). 동적 계획법, 두 행만 유지.
export function longestCommonSubstring(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = new Uint16Array(y.length + 1);
  let best = 0;
  let bestEnd = 0;
  for (let i = 1; i <= x.length; i += 1) {
    const cur = new Uint16Array(y.length + 1);
    for (let j = 1; j <= y.length; j += 1) {
      if (x[i - 1] === y[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) { best = cur[j]; bestEnd = i; }
      }
    }
    prev = cur;
  }
  return { length: best, snippet: x.slice(bestEnd - best, bestEnd).join('') };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docs = readJsonl(DOCS);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const tasks = new Map(readJsonl(TASKS).map((t) => [t.id, t]));
  const results = [];
  let flagged = 0;

  for (const doc of docs) {
    if (doc.source?.type !== 'ai-controlled') continue;
    const task = tasks.get(doc.task_id);
    if (!task || task.track !== 'parallel' || !task.derived_from) continue;
    const human = byId.get(task.derived_from);
    if (!human) continue;
    const overlap = sentenceOverlap(doc.text, human.text, args.minSentence);
    const lcs = longestCommonSubstring(canon(doc.text), canon(human.text));
    const contaminated = overlap.ratio >= args.sentenceThreshold || lcs.length >= args.lcsThreshold;
    const result = {
      document_id: doc.id,
      human_id: human.id,
      task_id: task.id,
      model: doc.source.model,
      sentence_overlap: Number(overlap.ratio.toFixed(3)),
      sentences_matched: overlap.matched,
      sentences_total: overlap.total,
      lcs_length: lcs.length,
      lcs_snippet: lcs.snippet.slice(0, 80),
      contaminated,
      thresholds: { sentence: args.sentenceThreshold, lcs: args.lcsThreshold },
      checked_at: new Date().toISOString(),
    };
    results.push(result);
    doc.contamination = { checked: true, contaminated, sentence_overlap: result.sentence_overlap, lcs_length: lcs.length };
    if (contaminated) flagged += 1;
  }

  mkdirSync('data/private', { recursive: true });
  writeFileSync(REPORT, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(DOCS, `${docs.map((d) => JSON.stringify(d)).join('\n')}\n`);

  const byModel = {};
  for (const r of results) {
    const s = (byModel[r.model] ??= { n: 0, flagged: 0, overlapSum: 0, lcsMax: 0 });
    s.n += 1;
    s.flagged += r.contaminated ? 1 : 0;
    s.overlapSum += r.sentence_overlap;
    s.lcsMax = Math.max(s.lcsMax, r.lcs_length);
  }
  console.log(`검사 ${results.length}건, 오염 판정 ${flagged}건 (문장 일치 ≥ ${args.sentenceThreshold} 또는 공통 부분 문자열 ≥ ${args.lcsThreshold}자)`);
  for (const [m, s] of Object.entries(byModel)) {
    console.log(`${m} | n=${s.n} | 오염 ${s.flagged} | 평균 문장 일치 ${(s.overlapSum / s.n).toFixed(3)} | 최장 공통 ${s.lcsMax}자`);
  }
}

if (process.argv[1]?.endsWith('check-contamination.mjs')) main();
