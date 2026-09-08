// Taxonomy 첫 시험(02_문체_품질_기준/Taxonomy_시험_계획.md) 표본 30건과 문맥 카드를 만든다.
// 출력(모두 data/private/taxonomy-sample/, 비공개):
//   manifest.jsonl        수집자용. 문서 ID, 장르 구분, 작성 주체, 선정 사유(Hard Negative 후보, 길이 구분 등)
//   contexts.jsonl        문맥 카드. 데이터 Schema의 context 레코드
//   evaluator_packet.md   평가자용. 작성 주체와 선정 사유를 제거하고 순서를 섞은 문서와 문맥 카드
//   judgment_template.csv 평가자가 채우는 판정 표
//
// 표본 구성 목표: 업무 보고 10, 안내문·공지 10, 설명 문서 10. 짧은 글(300자 미만) 8 이상, 긴 글(1,500자 이상) 6 이상,
// 제목·요약·본문 구조 6 이상, Hard Negative 후보 8 이상, 사람 문서 포함. 가상 예시와 Taxonomy 본문 예시 문장은 제외.
// 업무 보고 장르는 아직 사람 문서가 없어 통제 트랙 AI 문서로 채운다. 내부 문서가 들어오면 교체한다.
//
// 사용: node scripts/select-taxonomy-sample.mjs [--seed unslop-v0.2] [--size 30]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const DOCS = 'data/documents.jsonl';
const TASKS = 'data/tasks.jsonl';
const OUT_DIR = 'data/private/taxonomy-sample';
const CUES = ['다양한', '이를 통해', '또한', '할 수 있습니다', '효율적', '개선', '적극적으로', '필요가 있습니다'];
const TAXONOMY_EXAMPLE_PHRASES = ['혁신적이고 획기적인 자동 저장', '유관 부서와 협의해 고객 경험을 개선', '즉, 금요일까지 제출해야 한다는 뜻', '따라서 접수 마감은 금요일'];

function parseArgs(argv) {
  const args = { seed: 'unslop-v0.2', size: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') args.seed = argv[++i];
    else if (argv[i] === '--size') args.size = Number(argv[++i]);
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.codePointAt(0)) >>> 0;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; };
}
const shuffle = (arr, rand) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// 시험 계획의 세 장르 구분. 과제 영역과 문서 장르에서 정한다.
export function sampleGenre(doc, task) {
  const domain = task?.domain;
  if (domain === 'report' || doc.genre === 'report') return 'report';
  if (domain === 'email' || domain === 'marketing' || doc.genre === 'notice' || doc.genre === 'email' || doc.genre === 'marketing') return 'notice';
  return 'explainer';
}

export function features(doc) {
  const chars = Array.from(doc.text).length;
  const cues = CUES.filter((c) => doc.text.includes(c));
  const hasStructure = /^#{1,3}\s|\n#{1,3}\s|^제목\s*[:：]|\n(요약|개요|결론|다음 단계)\s*[:：]?\n/m.test(doc.text) || (doc.text.split('\n\n').length >= 4 && /^[^\n]{4,40}\n\n/.test(doc.text));
  return {
    chars,
    lengthClass: chars < 300 ? 'short' : chars >= 1500 ? 'long' : 'medium',
    cues,
    hardNegativeCandidate: cues.length >= 2,
    hasStructure,
    isHuman: doc.source?.type === 'wild-human' || doc.source?.type === 'human-controlled',
  };
}

export function selectSample(docs, tasks, args) {
  const rand = rng(args.seed);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const eligible = docs.filter((d) => !d.source?.fictional && !TAXONOMY_EXAMPLE_PHRASES.some((p) => d.text.includes(p)) && !d.contamination?.contaminated);
  const items = shuffle(eligible, rand).map((doc) => {
    const task = doc.task_id ? taskById.get(doc.task_id) : tasks.find((t) => t.derived_from === doc.id);
    return { doc, task, genre: sampleGenre(doc, task), f: features(doc) };
  });

  const perGenre = Math.round(args.size / 3);
  const quotas = { short: 8, long: 6, structure: 6, hardNeg: 8, human: Math.min(10, items.filter((i) => i.f.isHuman).length) };
  const chosen = [];
  const usedTasks = new Set();
  const count = (pred) => chosen.filter(pred).length;
  const genreCount = (g) => count((i) => i.genre === g);
  const need = (i) =>
    (i.f.lengthClass === 'short' && count((c) => c.f.lengthClass === 'short') < quotas.short) ||
    (i.f.lengthClass === 'long' && count((c) => c.f.lengthClass === 'long') < quotas.long) ||
    (i.f.hasStructure && count((c) => c.f.hasStructure) < quotas.structure) ||
    (i.f.hardNegativeCandidate && count((c) => c.f.hardNegativeCandidate) < quotas.hardNeg) ||
    (i.f.isHuman && count((c) => c.f.isHuman) < quotas.human);
  const MODEL_CAP = 8; // 한 모델의 문서가 표본을 지배하지 않게 한다.
  const modelOf = (i) => i.doc.source?.model ?? i.doc.source?.type;
  const take = (i) => { chosen.push(i); if (i.task) usedTasks.add(i.task.id); };
  const ok = (i) => genreCount(i.genre) < perGenre && !chosen.includes(i) && !(i.task && usedTasks.has(i.task.id)) && count((c) => modelOf(c) === modelOf(i)) < MODEL_CAP;

  // 1차: 사람 문서부터 쿼터를 채운다. 2차: 나머지 쿼터. 3차: 남은 장르 자리를 채운다.
  const humansFirst = [...items.filter((i) => i.f.isHuman), ...items.filter((i) => !i.f.isHuman)];
  for (const i of humansFirst) if (chosen.length < args.size && ok(i) && need(i)) take(i);
  for (const i of humansFirst) if (chosen.length < args.size && ok(i)) take(i);

  // 문맥 카드. 독자나 과제에 따라 판정이 갈릴 만한 문서 3개에는 두 번째 카드를 붙인다.
  const contexts = [];
  let cn = 0;
  const newCtx = () => `ctx-${String(++cn).padStart(3, '0')}`;
  for (const i of chosen) {
    const t = i.task;
    contexts.push({
      id: newCtx(), kind: 'context', document_id: i.doc.id,
      reader: t?.reader ?? null, purpose: t?.purpose ?? null, task: t ? `${t.title}. ${t.purpose ?? ''}`.trim() : null,
      scope: { type: 'full' },
      unknown: [!t?.reader && 'reader', !t?.purpose && 'purpose'].filter(Boolean),
      note: t?.reader_inferred ? '독자·목적은 원문에서 추정한 값이다.' : null,
    });
  }
  const second = chosen.filter((i) => i.genre !== 'report' && i.task).slice(0, 3);
  for (const i of second) {
    contexts.push({
      id: newCtx(), kind: 'context', document_id: i.doc.id,
      reader: '이 문서를 처음 접하는 일반 독자', purpose: '문서가 다루는 대상이 무엇인지와 자신이 해야 할 일이 있는지 빠르게 파악한다',
      task: `${i.task.title}. 일반 독자 관점의 두 번째 문맥 카드`, scope: { type: 'full' }, unknown: [],
      note: '같은 문서에 붙인 두 번째 카드다. 독자가 달라질 때 판정이 갈리는지 본다.',
    });
  }

  return { chosen, contexts, quotas, perGenre };
}

function renderPacket(chosen, contexts, rand) {
  const order = shuffle(chosen, rand);
  const L = ['# Taxonomy 첫 시험 평가자 자료', '', '문서 30건과 문맥 카드다. 작성 주체와 선정 사유는 제공하지 않는다. Annotation Guideline v0.1의 절차에 따라 문서 전체를 검토하고 judgment_template.csv에 기록한다.', ''];
  order.forEach((i, idx) => {
    const cards = contexts.filter((c) => c.document_id === i.doc.id);
    L.push(`## ${idx + 1}. ${i.doc.id}`, '');
    for (const c of cards) {
      L.push(`**문맥 카드 ${c.id}**`, '', `- 독자: ${c.reader ?? '알 수 없음'}`, `- 목적: ${c.purpose ?? '알 수 없음'}`, `- 과제: ${c.task ?? '알 수 없음'}`, `- 제공 범위: 문서 전체`);
      if (c.note) L.push(`- 참고: ${c.note}`);
      L.push('');
    }
    L.push('```text', i.doc.text, '```', '');
  });
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docs = readJsonl(DOCS);
  const tasks = readJsonl(TASKS);
  const { chosen, contexts, quotas, perGenre } = selectSample(docs, tasks, args);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/manifest.jsonl`, `${chosen.map((i) => JSON.stringify({
    document_id: i.doc.id, genre: i.genre, source_type: i.doc.source.type, model: i.doc.source.model ?? null, track: i.doc.track ?? (i.task?.track ?? null), task_id: i.task?.id ?? null,
    chars: i.f.chars, length_class: i.f.lengthClass, has_structure: i.f.hasStructure, hard_negative_candidate: i.f.hardNegativeCandidate, cues: i.f.cues,
    split: 'revision', taxonomy_version: '0.2', title: i.doc.title ?? i.task?.title ?? null,
  })).join('\n')}\n`);
  writeFileSync(`${OUT_DIR}/contexts.jsonl`, `${contexts.map((c) => JSON.stringify(c)).join('\n')}\n`);
  writeFileSync(`${OUT_DIR}/evaluator_packet.md`, `${renderPacket(chosen, contexts, rng(`${args.seed}-packet`))}\n`);
  writeFileSync(`${OUT_DIR}/judgment_template.csv`, 'document_id,context_id,evaluator_id,phase,review_scope,span_start,span_end,quote,related_quote,result,type,type_status,candidate_types,reason,hold_needs,revision,taxonomy_version,guideline_version,duration_sec\n');

  const c = (pred) => chosen.filter(pred).length;
  console.log(`표본 ${chosen.length}건 (장르당 ${perGenre}) → ${OUT_DIR}`);
  console.log(`장르: report ${c((i) => i.genre === 'report')}, notice ${c((i) => i.genre === 'notice')}, explainer ${c((i) => i.genre === 'explainer')}`);
  console.log(`짧은 글 ${c((i) => i.f.lengthClass === 'short')}/${quotas.short}, 긴 글 ${c((i) => i.f.lengthClass === 'long')}/${quotas.long}, 구조 있음 ${c((i) => i.f.hasStructure)}/${quotas.structure}, Hard Negative 후보 ${c((i) => i.f.hardNegativeCandidate)}/${quotas.hardNeg}, 사람 문서 ${c((i) => i.f.isHuman)}/${quotas.human}`);
  console.log(`문맥 카드 ${contexts.length}장 (두 번째 카드 ${contexts.length - chosen.length}장)`);
  const models = {};
  for (const i of chosen) { const k = i.doc.source.model ?? i.doc.source.type; models[k] = (models[k] ?? 0) + 1; }
  console.log('출처:', models);
}

if (process.argv[1]?.endsWith('select-taxonomy-sample.mjs')) main();
