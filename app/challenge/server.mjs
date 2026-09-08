// Unslop Challenge MVP 서버. Node 22 내장 모듈만 사용한다.
// 화면 흐름과 수집 항목은 05_제품과_사용_경험/Challenge_UX_Wireframe.md, 저장 형식은 03_데이터와_평가/데이터_Schema.md를 따른다.
//
// 실행: node app/challenge/server.mjs [--port 8787]
// 읽는 파일: data/documents.jsonl(비공개, source 포함), data/pairs.jsonl, data/private/pair_kinds.jsonl, data/tasks.jsonl
// 쓰는 파일: data/crowd_responses.jsonl
import { createServer } from 'node:http';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { splitSentences } from './sentences.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');
const RESPONSES = join(ROOT, 'data', 'crowd_responses.jsonl');
const PAIRS_PER_SESSION = 10;
const STATS_MIN_RESPONSES = 30;
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8787;

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// ---------- 데이터 ----------
const docs = new Map(readJsonl(join(ROOT, 'data', 'documents.jsonl')).map((d) => [d.id, d]));
const tasks = new Map(readJsonl(join(ROOT, 'data', 'tasks.jsonl')).map((t) => [t.id, t]));
const pairKinds = new Map(readJsonl(join(ROOT, 'data', 'private', 'pair_kinds.jsonl')).map((k) => [k.pair_id, k.pair_kind]));
const pairs = readJsonl(join(ROOT, 'data', 'pairs.jsonl')).filter((p) => p.document_ids.every((id) => docs.has(id)));
const responses = readJsonl(RESPONSES);
const sessions = new Map(); // session_id -> { seenPairs:Set, seenTasks:Set, served:Map(pair_id -> position) }

const responseCount = new Map();
for (const r of responses) responseCount.set(r.pair_id, (responseCount.get(r.pair_id) ?? 0) + 1);

const authorOf = (docId) => (docs.get(docId).source.type === 'ai-controlled' ? 'ai' : 'human');
const stripForDisplay = (s) =>
  s
    .replace(/^#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/g, '• ');

function docPayload(doc) {
  return {
    id: doc.id,
    sentences: splitSentences(doc.text).map((s) => ({ start: s.start, end: s.end, text: stripForDisplay(s.text), paragraph: s.paragraph, newParagraph: s.newParagraph })),
  };
}

function getSession(id) {
  if (!id) return null;
  if (!sessions.has(id)) {
    // 서버 재시작 후에도 이미 답한 쌍은 다시 내지 않는다.
    const seen = new Set(responses.filter((r) => r.session_id === id).map((r) => r.pair_id));
    const seenTasks = new Set([...seen].map((p) => pairs.find((x) => x.id === p)?.task_id).filter(Boolean));
    sessions.set(id, { seenPairs: seen, seenTasks, served: new Map() });
  }
  return sessions.get(id);
}

function pickPair(session) {
  const candidates = pairs.filter((p) => !session.seenPairs.has(p.id) && !session.seenTasks.has(p.task_id));
  if (!candidates.length) return null;
  const minCount = Math.min(...candidates.map((p) => responseCount.get(p.id) ?? 0));
  const least = candidates.filter((p) => (responseCount.get(p.id) ?? 0) === minCount);
  return least[Math.floor(Math.random() * least.length)];
}

// ---------- API ----------
function apiNext(query) {
  const session = getSession(query.get('session'));
  if (!session) return [400, { error: 'session 필요' }];
  if (session.seenPairs.size >= PAIRS_PER_SESSION) return [200, { done: true }];
  const pair = pickPair(session);
  if (!pair) return [200, { done: true, reason: 'no-more-pairs' }];
  const [x, y] = pair.document_ids;
  const swap = Math.random() < 0.5;
  const position = { A: swap ? y : x, B: swap ? x : y };
  session.served.set(pair.id, position);
  const task = tasks.get(pair.task_id);
  return [200, {
    pair_id: pair.id,
    index: session.seenPairs.size + 1,
    total: PAIRS_PER_SESSION,
    task: { title: task?.title ?? '', reader: task?.reader ?? '', purpose: task?.purpose ?? '' },
    A: docPayload(docs.get(position.A)),
    B: docPayload(docs.get(position.B)),
  }];
}

function apiRespond(body) {
  const session = getSession(body.session_id);
  if (!session) return [400, { error: 'session 필요' }];
  const position = session.served.get(body.pair_id);
  if (!position) return [400, { error: '제시되지 않은 쌍' }];
  if (session.seenPairs.has(body.pair_id)) return [409, { error: '이미 답한 쌍' }];
  const pair = pairs.find((p) => p.id === body.pair_id);
  const record = {
    id: `crowd-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    kind: 'crowd_response',
    session_id: body.session_id,
    pair_id: body.pair_id,
    position,
    source_guess: body.source_guess,
    confidence: body.confidence,
    preference: body.preference,
    selected_spans: Array.isArray(body.selected_spans) ? body.selected_spans : [],
    categories: Array.isArray(body.categories) ? body.categories : [],
    other_text: body.other_text ?? '',
    timings_ms: body.timings_ms ?? {},
    revealed: true,
    created_at: new Date().toISOString(),
  };
  mkdirSync(dirname(RESPONSES), { recursive: true });
  appendFileSync(RESPONSES, `${JSON.stringify(record)}\n`);
  responses.push(record);
  responseCount.set(pair.id, (responseCount.get(pair.id) ?? 0) + 1);
  session.seenPairs.add(pair.id);
  session.seenTasks.add(pair.task_id);

  const truth = { A: authorOf(position.A), B: authorOf(position.B) };
  const correct = truth.A === record.source_guess?.A && truth.B === record.source_guess?.B;
  const pairResponses = responses.filter((r) => r.pair_id === pair.id);
  let stats = null;
  if (pairResponses.length >= STATS_MIN_RESPONSES) {
    // 위치가 응답마다 다르므로 문서 ID 기준으로 집계한다.
    const prefer = {};
    for (const r of pairResponses) {
      if (r.preference === 'similar') continue;
      const docId = r.position[r.preference];
      prefer[docId] = (prefer[docId] ?? 0) + 1;
    }
    stats = { n: pairResponses.length, preferred: { A: prefer[position.A] ?? 0, B: prefer[position.B] ?? 0 } };
  }
  return [200, { truth, correct, pair_kind: pairKinds.get(pair.id) ?? null, stats, answered: session.seenPairs.size, total: PAIRS_PER_SESSION }];
}

function apiSummary(query) {
  const id = query.get('session');
  const mine = responses.filter((r) => r.session_id === id);
  const score = (rs) => rs.filter((r) => authorOf(r.position.A) === r.source_guess?.A && authorOf(r.position.B) === r.source_guess?.B).length;
  const certain = mine.filter((r) => r.confidence === 'certain');
  const preferredAi = mine.filter((r) => r.preference !== 'similar' && authorOf(r.position[r.preference]) === 'ai').length;
  const bySession = new Map();
  for (const r of responses) (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)).push(r);
  const others = [...bySession.entries()].filter(([s, rs]) => s !== id && rs.length >= PAIRS_PER_SESSION);
  const othersAvg = others.length ? others.reduce((a, [, rs]) => a + score(rs) / rs.length, 0) / others.length : null;
  return [200, {
    answered: mine.length,
    correct: score(mine),
    certain: { n: certain.length, correct: score(certain) },
    preferred_ai: preferredAi,
    others_avg_correct: othersAvg === null ? null : Math.round(othersAvg * PAIRS_PER_SESSION * 10) / 10,
    others_n: others.length,
  }];
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/session' && req.method === 'POST') {
      const id = `s-${randomBytes(6).toString('hex')}`;
      getSession(id);
      return send(res, 200, { session_id: id, pairs_per_session: PAIRS_PER_SESSION });
    }
    if (url.pathname === '/api/next') return send(res, ...apiNext(url.searchParams));
    if (url.pathname === '/api/summary') return send(res, ...apiSummary(url.searchParams));
    if (url.pathname === '/api/response' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      return send(res, ...apiRespond(JSON.parse(raw || '{}')));
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const path = join(PUBLIC, file);
    if (!path.startsWith(PUBLIC) || !existsSync(path)) return send(res, 404, 'not found', 'text/plain');
    return send(res, 200, readFileSync(path), MIME[extname(path)] ?? 'application/octet-stream');
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message });
  }
});

server.listen(port, () => {
  console.log(`Unslop Challenge: http://localhost:${port}  (쌍 ${pairs.length}개, 응답 ${responses.length}건)`);
});
