// 병렬 트랙(03_데이터와_평가/병렬_말뭉치_계획.md)의 Wild Human 문서를 수집해 data/documents.jsonl에 덧붙인다.
// 출처 두 종류를 지원한다.
//   korea-kr : 정책브리핑 정책뉴스. 텍스트는 공공누리 제1유형(출처표시). newsId로 접근한다.
//   github   : 한국어 README. 허용적 라이선스(MIT, Apache-2.0, BSD 계열)만 받는다. owner/repo로 접근한다.
//
// 사용:
//   node scripts/collect-human-docs.mjs korea-kr --scan 148878000 148896000 600 [--before 2022-01-01] [--min 800 --max 4000] [--limit 15]
//   node scripts/collect-human-docs.mjs korea-kr --ids 148880000,148890000
//   node scripts/collect-human-docs.mjs github --search "한국어 in:readme license:mit pushed:<2022-01-01 stars:>30" [--limit 15]
//   node scripts/collect-human-docs.mjs github --repos owner/repo,owner2/repo2
// 같은 origin_url은 다시 수집하지 않는다.
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalizeText } from './text.mjs';

const DOCS = 'data/documents.jsonl';
const LOG = 'data/private/collect.log';
const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC-BY-4.0', 'CC0-1.0', 'Unlicense', '0BSD']);

function parseArgs(argv) {
  const args = { kind: argv[0], before: '2022-01-01', min: 800, max: 4000, limit: Infinity };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--scan') args.scan = [Number(next()), Number(next()), Number(next())];
    else if (a === '--ids') args.ids = next().split(',');
    else if (a === '--repos') args.repos = next().split(',');
    else if (a === '--search') args.search = next();
    else if (a === '--before') args.before = next();
    else if (a === '--min') args.min = Number(next());
    else if (a === '--max') args.max = Number(next());
    else if (a === '--limit') args.limit = Number(next());
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (!['korea-kr', 'github'].includes(args.kind)) throw new Error('첫 인자는 korea-kr 또는 github');
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

function nextDocId(docs) {
  let n = docs.reduce((m, d) => Math.max(m, Number((d.id ?? 'doc-0').split('-')[1]) || 0), 0);
  return () => `doc-${String(++n).padStart(4, '0')}`;
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<[^>]*$/, '') // 잘린 꼬리 태그
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n');
}

export function koreanRatio(text) {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!letters.length) return 0;
  const kor = (letters.match(/[가-힣]/g) ?? []).length;
  return kor / Array.from(letters).length;
}

// ---------- korea.kr ----------

export function parseKoreaKr(html) {
  const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').split(' - ')[0].trim();
  const date = html.match(/(20\d{2})\.(\d{2})\.(\d{2})/);
  const authoredAt = date ? `${date[1]}-${date[2]}-${date[3]}` : null;
  const i = html.indexOf('article_body');
  const j = html.indexOf('article_footer', i);
  if (i < 0 || j < 0) return null;
  const tagEnd = html.indexOf('>', i);
  let body = htmlToText(html.slice(tagEnd + 1, j));
  // 기사 말미의 문의처·전재 안내는 본문이 아니다.
  body = body.replace(/\n\s*문의\s*[:：][\s\S]*$/, '').replace(/[“"]이 자료는[\s\S]*?제공함을 알려드립니다\.[”"]/g, '');
  // 사진 설명 줄은 기사 본문이 아니다.
  body = body
    .split('\n')
    .filter((line) => !/\(사진=|\(자료=|저작권자\(c\)/.test(line))
    .join('\n');
  const kogl = /공공누리\s*제1유형/.test(html);
  return { title, authoredAt, body: normalizeText(body), kogl };
}

async function fetchKoreaKr(newsId) {
  const url = `https://www.korea.kr/news/policyNewsView.do?newsId=${newsId}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 unslop-collector' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const parsed = parseKoreaKr(html);
  if (!parsed) throw new Error('본문 영역 없음');
  return { url, ...parsed };
}

async function collectKoreaKr(args, ctx) {
  const ids = args.ids ?? [];
  if (args.scan) {
    const [start, end, step] = args.scan;
    for (let id = start; id <= end; id += step) ids.push(String(id));
  }
  let kept = 0;
  for (const id of ids) {
    if (kept >= args.limit) break;
    const url = `https://www.korea.kr/news/policyNewsView.do?newsId=${id}`;
    if (ctx.seen.has(url)) { log(`SKIP ${id} 이미 수집`); continue; }
    try {
      const a = await fetchKoreaKr(id);
      const chars = Array.from(a.body).length;
      const reasons = [];
      if (!a.authoredAt) reasons.push('날짜 없음');
      else if (a.authoredAt >= args.before) reasons.push(`작성일 ${a.authoredAt}`);
      if (chars < args.min || chars > args.max) reasons.push(`${chars}자`);
      if (!a.kogl) reasons.push('공공누리 표시 없음');
      if (koreanRatio(a.body) < 0.6) reasons.push('한국어 비율 낮음');
      if (/\[[^\]]*\]$/.test(a.body.trim().split('\n').pop() ?? '')) { /* 기자 서명 줄은 유지 */ }
      if (reasons.length) { log(`DROP ${id} ${reasons.join(', ')} | ${a.title}`); continue; }
      const record = {
        id: ctx.newId(),
        kind: 'document',
        task_id: null,
        text: a.body,
        title: a.title,
        language: 'ko',
        genre: 'other',
        source: {
          type: 'wild-human',
          origin_url: url,
          retrieved_at: new Date().toISOString(),
          authorship_confidence: 'medium',
          authored_at_estimate: `${a.authoredAt} 게재일 기준. 정책브리핑 정책뉴스로 생성 모델 보편화 이전 작성.`,
          fictional: false,
        },
        license: 'KOGL-1 (공공누리 제1유형, 출처표시, 텍스트에 한함)',
        collection_note: `정책브리핑 정책뉴스 본문. ${chars}자. 문의처·전재 안내 제거.`,
        created_at: new Date().toISOString(),
      };
      appendFileSync(DOCS, `${JSON.stringify(record)}\n`);
      ctx.seen.add(url);
      kept += 1;
      log(`OK ${record.id} ${id} ${a.authoredAt} ${chars}자 | ${a.title}`);
    } catch (err) {
      log(`FAIL ${id} ${err.message}`);
    }
  }
  return kept;
}

// ---------- GitHub ----------

function gh(args) {
  // shell을 쓰지 않는다. 검색어의 '<'가 리디렉션으로 해석되기 때문이다.
  const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
  return execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

export function cleanReadme(md) {
  return normalizeText(
    md
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/gm, '') // 배지 링크
      .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, '') // 이미지 한 줄
      .replace(/<(img|a|p|br|div|h\d|table|tr|td|th|details|summary|picture|source)[^>]*>|<\/(a|p|div|h\d|table|tr|td|th|details|summary|picture)>/gi, '')
      .replace(/\n{3,}/g, '\n\n'),
  );
}

async function collectGithub(args, ctx) {
  let repos = args.repos ?? [];
  if (args.search) {
    const out = gh(['api', '-X', 'GET', 'search/repositories', '-f', `q=${args.search}`, '-f', 'per_page=50', '--jq', '.items[].full_name']);
    repos = repos.concat(out.split('\n').filter(Boolean));
  }
  let kept = 0;
  for (const full of repos) {
    if (kept >= args.limit) break;
    const url = `https://github.com/${full}`;
    if (ctx.seen.has(url)) { log(`SKIP ${full} 이미 수집`); continue; }
    try {
      const meta = JSON.parse(gh(['api', `repos/${full}`]));
      const spdx = meta.license?.spdx_id ?? 'NONE';
      // 기본 README가 영어면 한국어 README 파일을 찾는다.
      let readmeMeta = JSON.parse(gh(['api', `repos/${full}/readme`]));
      let raw = Buffer.from(readmeMeta.content, 'base64').toString('utf8');
      let text = cleanReadme(raw);
      let ratio = koreanRatio(text.replace(/```[\s\S]*?```/g, ''));
      if (ratio < 0.4) {
        for (const alt of ['README.ko.md', 'README_ko.md', 'README.kr.md', 'README-ko.md', 'README.ko-KR.md', 'README_KR.md', 'docs/README.ko.md']) {
          try {
            const m = JSON.parse(gh(['api', `repos/${full}/contents/${alt}`]));
            const t = cleanReadme(Buffer.from(m.content, 'base64').toString('utf8'));
            const r = koreanRatio(t.replace(/```[\s\S]*?```/g, ''));
            if (r > ratio) { readmeMeta = m; raw = t; text = t; ratio = r; }
            if (ratio >= 0.4) break;
          } catch { /* 없음 */ }
        }
      }
      const chars = Array.from(text).length;
      const commits = JSON.parse(gh(['api', `repos/${full}/commits?path=${encodeURIComponent(readmeMeta.path)}&per_page=1`]));
      const lastEdit = commits[0]?.commit?.committer?.date?.slice(0, 10) ?? null;
      const reasons = [];
      if (!PERMISSIVE.has(spdx)) reasons.push(`라이선스 ${spdx}`);
      if (!lastEdit) reasons.push('README 수정일 없음');
      else if (lastEdit >= args.before) reasons.push(`README 수정일 ${lastEdit}`);
      if (chars < args.min || chars > args.max) reasons.push(`${chars}자`);
      if (ratio < 0.4) reasons.push(`한국어 비율 ${ratio.toFixed(2)}`);
      if (reasons.length) { log(`DROP ${full} ${reasons.join(', ')}`); continue; }
      const record = {
        id: ctx.newId(),
        kind: 'document',
        task_id: null,
        text,
        title: `${full} README`,
        language: 'ko',
        genre: 'manual',
        source: {
          type: 'wild-human',
          origin_url: url,
          origin_path: readmeMeta.path,
          retrieved_at: new Date().toISOString(),
          authorship_confidence: 'high',
          authored_at_estimate: `README 최종 수정 ${lastEdit} (커밋 이력 기준)`,
          fictional: false,
        },
        license: spdx,
        collection_note: `GitHub README 원문(마크다운 유지, 배지·이미지·HTML 태그 제거). ${chars}자, 한국어 비율 ${ratio.toFixed(2)}.`,
        created_at: new Date().toISOString(),
      };
      appendFileSync(DOCS, `${JSON.stringify(record)}\n`);
      ctx.seen.add(url);
      kept += 1;
      log(`OK ${record.id} ${full} ${spdx} ${lastEdit} ${chars}자 ko=${ratio.toFixed(2)}`);
    } catch (err) {
      log(`FAIL ${full} ${err.message.split('\n')[0].slice(0, 200)}`);
    }
  }
  return kept;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const docs = readJsonl(DOCS);
  const ctx = {
    newId: nextDocId(docs),
    seen: new Set(docs.map((d) => d.source?.origin_url).filter(Boolean)),
  };
  const kept = args.kind === 'korea-kr' ? await collectKoreaKr(args, ctx) : await collectGithub(args, ctx);
  log(`완료: ${args.kind} ${kept}건 수집`);
}

if (process.argv[1]?.endsWith('collect-human-docs.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
