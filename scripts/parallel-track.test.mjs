import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon, sentenceOverlap, longestCommonSubstring } from './check-contamination.mjs';
import { buildPairs, lengthRatio } from './build-pairs.mjs';
import { shuffleSeeded, lengthRange } from './extract-brief.mjs';
import { koreanRatio, cleanReadme, parseKoreaKr } from './collect-human-docs.mjs';

test('sentenceOverlap: 원문 문장을 그대로 쓴 비율을 센다', () => {
  const human = '정부는 내년 시험을 두 번 실시한다. 상반기 시험은 1월 말에 치른다. 인턴 모집은 구분해 진행한다.';
  const ai = '정부는 내년 시험을 두 번 실시한다.\n새로운 문장이 여기에 하나 들어간다.';
  const r = sentenceOverlap(ai, human, 10);
  assert.equal(r.total, 2);
  assert.equal(r.matched, 1);
  assert.equal(r.ratio, 0.5);
});

test('longestCommonSubstring과 canon', () => {
  assert.equal(canon('가, 나! 다.'), '가나다');
  const r = longestCommonSubstring('abc가나다라xyz', '123가나다라456');
  assert.equal(r.length, 4);
  assert.equal(r.snippet, '가나다라');
});

test('buildPairs: human-ai 쌍을 만들고 분량 비율 초과와 오염 문서를 제외한다', () => {
  const tasks = [{ id: 'task-101', track: 'parallel', derived_from: 'doc-h', review_status: 'approved' }];
  const docs = [
    { id: 'doc-h', task_id: null, text: '가'.repeat(1000), source: { type: 'wild-human' } },
    { id: 'doc-a', task_id: 'task-101', text: '나'.repeat(900), source: { type: 'ai-controlled' } },
    { id: 'doc-b', task_id: 'task-101', text: '다'.repeat(300), source: { type: 'ai-controlled' } },
    { id: 'doc-c', task_id: 'task-101', text: '라'.repeat(950), source: { type: 'ai-controlled' }, contamination: { contaminated: true } },
  ];
  const { pairs, kinds, excluded } = buildPairs(docs, tasks, { maxRatio: 2.0, aiAiPerTask: 1, includePending: false });
  const kindsById = Object.fromEntries(kinds.map((k) => [k.pair_id, k.pair_kind]));
  assert.equal(excluded.ratio, 2); // doc-h/doc-b (human-ai), doc-a/doc-b (ai-ai)
  assert.deepEqual(pairs.map((p) => p.document_ids), [['doc-h', 'doc-a']]);
  assert.equal(kindsById[pairs[0].id], 'human-ai');
  assert.ok(!JSON.stringify(pairs).includes('human'), '공개 쌍 파일에 작성 주체가 들어가지 않는다');
});

test('buildPairs: pending 과제는 기본으로 제외한다', () => {
  const tasks = [{ id: 'task-101', track: 'parallel', derived_from: 'doc-h', review_status: 'pending' }];
  const docs = [
    { id: 'doc-h', task_id: null, text: '가'.repeat(500), source: { type: 'wild-human' } },
    { id: 'doc-a', task_id: 'task-101', text: '나'.repeat(500), source: { type: 'ai-controlled' } },
  ];
  assert.equal(buildPairs(docs, tasks, { maxRatio: 2, aiAiPerTask: 1, includePending: false }).pairs.length, 0);
  assert.equal(buildPairs(docs, tasks, { maxRatio: 2, aiAiPerTask: 1, includePending: true }).pairs.length, 1);
});

test('lengthRatio, lengthRange, shuffleSeeded', () => {
  assert.equal(lengthRatio({ text: '가'.repeat(300) }, { text: '가'.repeat(600) }), 2);
  assert.deepEqual(lengthRange(1000), { min: 700, max: 1300, unit: 'chars' });
  const a = shuffleSeeded(['1', '2', '3', '4', '5'], 'doc-0001');
  assert.deepEqual(a, shuffleSeeded(['1', '2', '3', '4', '5'], 'doc-0001'));
  assert.deepEqual(a.slice().sort(), ['1', '2', '3', '4', '5']);
});

test('koreanRatio와 cleanReadme', () => {
  assert.ok(koreanRatio('한국어 문장입니다 hello') > 0.6);
  assert.equal(koreanRatio('hello world'), 0);
  const md = '# 제목\n\n[![badge](https://x/b.svg)](https://x)\n\n<img src="a.png">\n본문입니다.\n';
  assert.equal(cleanReadme(md), '# 제목\n\n본문입니다.');
});

test('parseKoreaKr: 본문·날짜·공공누리 표시를 읽고 사진 설명을 제거한다', () => {
  const html = `<title>기사 제목 - 정책뉴스 | 뉴스</title><span>2021.03.03</span>
<div class="article_body"><p>첫 문단입니다.</p><p>사진 설명 (사진=저작권자(c) 연합뉴스)</p><p>둘째 &ldquo;문단&rdquo;입니다.</p></div>
<div class="article_footer">공공누리 제1유형</div>`;
  const r = parseKoreaKr(html);
  assert.equal(r.title, '기사 제목');
  assert.equal(r.authoredAt, '2021-03-03');
  assert.ok(r.kogl);
  assert.equal(r.body, '첫 문단입니다.\n둘째 "문단"입니다.');
});
