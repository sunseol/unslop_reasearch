// Challenge 응답(data/crowd_responses.jsonl)을 집계해 시범 운영 보고서를 만든다.
// 작성 주체를 함께 집계하므로 보고서는 data/private/crowd-report.md에 쓴다.
//
// 사용: node scripts/report-crowd.mjs [--min-session-pairs 1] [--top 20]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const RESPONSES = 'data/crowd_responses.jsonl';
const DOCS = 'data/documents.jsonl';
const PAIRS = 'data/pairs.jsonl';
const PAIR_KINDS = 'data/private/pair_kinds.jsonl';
const OUT = 'data/private/crowd-report.md';

const CATEGORY_LABEL = {
  verbose: '장황하다', abstract: '추상적이다', cliche: '뻔한 표현이다', repetitive: '반복적이다',
  overexplained: '과하게 설명한다', translated: '번역체 같다', 'ai-structure': '문장 구조가 AI스럽다', other: '기타',
};
const CONFIDENCE_ORDER = ['guess', 'slight', 'fairly', 'certain'];
const CONFIDENCE_LABEL = { guess: '찍었다', slight: '약간 확신', fairly: '꽤 확신', certain: '확실하다' };

function parseArgs(argv) {
  const args = { minSessionPairs: 1, top: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--min-session-pairs') args.minSessionPairs = Number(argv[++i]);
    else if (argv[i] === '--top') args.top = Number(argv[++i]);
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return args;
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '-');
const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

// 문장 오분리 후보: 선택 문장이 매우 짧거나, 문장 부호 없이 끝나면서 다음 문장이 소문자·조사로 시작하거나, 내부에 ". "가 있다.
export function missplitCandidates(spans, docsById) {
  const out = [];
  for (const s of spans) {
    const doc = docsById.get(s.document_id);
    if (!doc) continue;
    const text = Array.from(doc.text).slice(s.start, s.end).join('');
    const reasons = [];
    if (Array.from(text).length < 8) reasons.push('8자 미만');
    if (/[가-힣a-z0-9]\. [가-힣]/.test(text)) reasons.push('내부에 마침표+공백');
    if (!/[.!?。)\]"”'’]$/.test(text) && !/^[-•#*\d]/.test(text)) reasons.push('문장 부호 없이 끝남');
    if (reasons.length) out.push({ document_id: s.document_id, start: s.start, end: s.end, text: text.slice(0, 80), reasons });
  }
  return out;
}

export function aggregate(responses, docsById, pairsById, kinds, args) {
  const authorOf = (id) => (docsById.get(id)?.source?.type === 'ai-controlled' ? 'ai' : 'human');
  const isCorrect = (r) => authorOf(r.position.A) === r.source_guess?.A && authorOf(r.position.B) === r.source_guess?.B;

  const bySession = new Map();
  for (const r of responses) (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)).push(r);
  const sessions = [...bySession.values()].filter((rs) => rs.length >= args.minSessionPairs);
  const rs = sessions.flat();

  // 쌍별 응답 수
  const perPair = new Map();
  for (const r of rs) perPair.set(r.pair_id, (perPair.get(r.pair_id) ?? 0) + 1);
  const covered = perPair.size;
  const counts = [...perPair.values()];

  // 정답률: 전체, pair_kind별, 확신별
  const byKind = {};
  for (const r of rs) {
    const k = kinds.get(r.pair_id) ?? 'unknown';
    const s = (byKind[k] ??= { n: 0, correct: 0 });
    s.n += 1;
    s.correct += isCorrect(r) ? 1 : 0;
  }
  const byConf = {};
  for (const r of rs) {
    const s = (byConf[r.confidence] ??= { n: 0, correct: 0 });
    s.n += 1;
    s.correct += isCorrect(r) ? 1 : 0;
  }

  // 4분면: 실제 작성자 × 선호. 선호된 문서 기준으로 센다(similar 제외).
  const quadrant = { human: { preferred: 0, notPreferred: 0 }, ai: { preferred: 0, notPreferred: 0 } };
  let similar = 0;
  for (const r of rs) {
    if (r.preference === 'similar') { similar += 1; continue; }
    const win = r.position[r.preference];
    const lose = r.position[r.preference === 'A' ? 'B' : 'A'];
    quadrant[authorOf(win)].preferred += 1;
    quadrant[authorOf(lose)].notPreferred += 1;
  }

  // 문서별 선택 문장
  const spanCount = new Map();
  const allSpans = [];
  for (const r of rs) for (const s of r.selected_spans ?? []) {
    const key = `${s.document_id}|${s.start}|${s.end}`;
    spanCount.set(key, (spanCount.get(key) ?? 0) + 1);
    allSpans.push(s);
  }
  const topSpans = [...spanCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, args.top).map(([key, n]) => {
    const [document_id, start, end] = key.split('|');
    const doc = docsById.get(document_id);
    const text = doc ? Array.from(doc.text).slice(Number(start), Number(end)).join('') : '';
    return { document_id, author: authorOf(document_id), n, text: text.slice(0, 70) };
  });
  const selectedByAuthor = { human: 0, ai: 0 };
  for (const s of allSpans) selectedByAuthor[authorOf(s.document_id)] += 1;

  // 이유 분포
  const cats = {};
  for (const r of rs) for (const c of r.categories ?? []) cats[c] = (cats[c] ?? 0) + 1;
  const others = rs.map((r) => r.other_text).filter(Boolean);

  // 응답 시간
  const timing = {};
  for (const key of ['read', 'q1', 'q2', 'q3', 'q4', 'q5']) {
    timing[key] = median(rs.map((r) => r.timings_ms?.[key]).filter((x) => Number.isFinite(x)));
  }
  const perPairTotal = median(rs.map((r) => Object.values(r.timings_ms ?? {}).reduce((a, b) => a + b, 0)).filter((x) => x > 0));

  const missplit = missplitCandidates(allSpans, docsById);

  return { sessions: sessions.length, allSessions: bySession.size, n: rs.length, covered, totalPairs: pairsById.size, counts, byKind, byConf, quadrant, similar, topSpans, selectedByAuthor, spansTotal: allSpans.length, cats, others, timing, perPairTotal, missplit };
}

export function renderReport(a, args) {
  const L = [];
  L.push(`# Challenge 응답 보고서`, '', `생성 ${new Date().toISOString()}. 세션 ${a.sessions}개(전체 ${a.allSessions}개 중 ${args.minSessionPairs}쌍 이상 답한 세션), 응답 ${a.n}건. 작성 주체가 포함되어 있어 비공개다.`, '');
  L.push('## 쌍 커버리지', '', `전체 ${a.totalPairs}쌍 중 ${a.covered}쌍에 응답이 있다. 쌍별 응답 수 중앙값 ${median(a.counts) ?? '-'}, 최대 ${a.counts.length ? Math.max(...a.counts) : '-'}. 정답 화면 통계는 30건부터 표시된다.`, '');
  L.push('## 작성 주체 추측 정답률', '');
  L.push(table(['쌍 종류', '응답', '정답률'], Object.entries(a.byKind).map(([k, s]) => [k, s.n, pct(s.correct, s.n)])), '');
  L.push(table(['확신', '응답', '정답률'], CONFIDENCE_ORDER.filter((c) => a.byConf[c]).map((c) => [CONFIDENCE_LABEL[c], a.byConf[c].n, pct(a.byConf[c].correct, a.byConf[c].n)])), '');
  L.push('## 선호와 작성 주체 (4분면)', '', `비슷하다 ${a.similar}건 제외. 선호된 쪽과 선호되지 않은 쪽을 실제 작성자별로 센다.`, '');
  L.push(table(['실제 작성자', '선호됨', '선호되지 않음', '선호 비율'], ['human', 'ai'].map((k) => [k, a.quadrant[k].preferred, a.quadrant[k].notPreferred, pct(a.quadrant[k].preferred, a.quadrant[k].preferred + a.quadrant[k].notPreferred)])), '');
  L.push('## 선택된 문장', '', `선택 ${a.spansTotal}건. 사람 문서 ${a.selectedByAuthor.human}건, AI 문서 ${a.selectedByAuthor.ai}건.`, '');
  L.push(table(['문서', '작성자', '선택 수', '문장'], a.topSpans.map((s) => [s.document_id, s.author, s.n, s.text.replace(/\|/g, '/')])), '');
  L.push('## 이유 분포', '');
  L.push(table(['이유', '건수'], Object.entries(a.cats).sort((x, y) => y[1] - x[1]).map(([c, n]) => [CATEGORY_LABEL[c] ?? c, n])), '');
  if (a.others.length) L.push('기타 입력:', '', ...a.others.map((t) => `- ${t.replace(/\n/g, ' ')}`), '');
  L.push('## 응답 시간 (중앙값, 초)', '');
  L.push(table(['단계', '초'], [['읽기', 'read'], ['추측', 'q1'], ['확신', 'q2'], ['선호', 'q3'], ['문장 선택', 'q4'], ['이유', 'q5']].map(([label, k]) => [label, a.timing[k] === null ? '-' : (a.timing[k] / 1000).toFixed(1)])), '');
  L.push(`쌍 하나 전체 ${a.perPairTotal === null ? '-' : (a.perPairTotal / 1000).toFixed(1)}초. Wireframe 목표는 60초 안팎이다.`, '');
  L.push('## 문장 오분리 후보', '', `선택 문장 중 ${a.missplit.length}건. 문장 분리 규칙(app/challenge/sentences.mjs) 개정 자료다.`, '');
  if (a.missplit.length) L.push(table(['문서', '구간', '사유', '문장'], a.missplit.slice(0, args.top).map((m) => [m.document_id, `${m.start}-${m.end}`, m.reasons.join(', '), m.text.replace(/\|/g, '/')])), '');
  L.push('## 해석 주의', '', '- 이 수치는 Challenge 참여자의 인상 자료다. Taxonomy 판정이나 Gold가 아니다.', '- 쌍별 응답 수가 적을 때 정답률과 선호 비율은 흔들린다. 쌍당 30건 이상 모인 뒤 해석한다.', '- 선택 문장이 몰리는 구간은 전문 평가자 후보 구간으로 넘길 수 있다. 그때 review_scope는 candidate-spans로 기록한다.');
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const responses = readJsonl(RESPONSES);
  const docsById = new Map(readJsonl(DOCS).map((d) => [d.id, d]));
  const pairsById = new Map(readJsonl(PAIRS).map((p) => [p.id, p]));
  const kinds = new Map(readJsonl(PAIR_KINDS).map((k) => [k.pair_id, k.pair_kind]));
  const a = aggregate(responses, docsById, pairsById, kinds, args);
  mkdirSync('data/private', { recursive: true });
  writeFileSync(OUT, `${renderReport(a, args)}\n`);
  console.log(`응답 ${a.n}건, 세션 ${a.sessions}개, 쌍 ${a.covered}/${a.totalPairs} → ${OUT}`);
}

if (process.argv[1]?.endsWith('report-crowd.mjs')) main();
