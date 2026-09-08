import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missplitCandidates, aggregate } from './report-crowd.mjs';
import { features, sampleGenre, selectSample } from './select-taxonomy-sample.mjs';

test('missplitCandidates: 짧은 구간, 내부 마침표, 부호 없는 끝을 잡는다', () => {
  const docs = new Map([['doc-1', { text: '첫 문장입니다. 둘째 문장입니다 그리고 이어집니다\n짧다' }]]);
  const spans = [
    { document_id: 'doc-1', start: 0, end: 8 }, // "첫 문장입니다." 정상
    { document_id: 'doc-1', start: 0, end: 26 }, // 내부에 ". " 포함
    { document_id: 'doc-1', start: 27, end: 29 }, // "짧다"
  ];
  const r = missplitCandidates(spans, docs);
  assert.equal(r.length, 2);
  assert.ok(r[0].reasons.includes('내부에 마침표+공백'));
  assert.ok(r[1].reasons.includes('8자 미만'));
});

test('aggregate: 정답률과 4분면을 작성 주체 기준으로 센다', () => {
  const docs = new Map([
    ['h', { source: { type: 'wild-human' }, text: '사람 글' }],
    ['a', { source: { type: 'ai-controlled' }, text: 'AI 글' }],
  ]);
  const responses = [
    { session_id: 's1', pair_id: 'p1', position: { A: 'h', B: 'a' }, source_guess: { A: 'human', B: 'ai' }, confidence: 'certain', preference: 'A', selected_spans: [], categories: ['verbose'], timings_ms: { read: 1000 } },
    { session_id: 's1', pair_id: 'p2', position: { A: 'a', B: 'h' }, source_guess: { A: 'human', B: 'ai' }, confidence: 'guess', preference: 'A', selected_spans: [], categories: [], timings_ms: { read: 3000 } },
  ];
  const a = aggregate(responses, docs, new Map([['p1', {}], ['p2', {}]]), new Map([['p1', 'human-ai'], ['p2', 'human-ai']]), { minSessionPairs: 1, top: 5 });
  assert.equal(a.byKind['human-ai'].correct, 1);
  assert.equal(a.byConf.certain.correct, 1);
  assert.equal(a.quadrant.human.preferred, 1);
  assert.equal(a.quadrant.ai.preferred, 1);
  assert.equal(a.timing.read, 2000);
});

test('features와 sampleGenre', () => {
  const doc = { text: '# 제목\n\n다양한 기능을 제공합니다. 이를 통해 편리합니다.', source: { type: 'wild-human' } };
  const f = features(doc);
  assert.equal(f.lengthClass, 'short');
  assert.ok(f.hardNegativeCandidate);
  assert.ok(f.hasStructure);
  assert.ok(f.isHuman);
  assert.equal(sampleGenre({ genre: 'other' }, { domain: 'report' }), 'report');
  assert.equal(sampleGenre({ genre: 'other' }, { domain: 'email' }), 'notice');
  assert.equal(sampleGenre({ genre: 'manual' }, { domain: 'technical' }), 'explainer');
});

test('selectSample: 가상 예시와 오염 문서를 제외하고 같은 과제를 두 번 고르지 않는다', () => {
  const tasks = [{ id: 't1', domain: 'report', reader: 'r', purpose: 'p', title: 'T' }];
  const docs = [
    { id: 'd1', task_id: 't1', text: '가'.repeat(400), source: { type: 'ai-controlled', model: 'm1' } },
    { id: 'd2', task_id: 't1', text: '나'.repeat(400), source: { type: 'ai-controlled', model: 'm2' } },
    { id: 'd3', task_id: null, text: '다'.repeat(400), source: { type: 'hard-negative', fictional: true } },
    { id: 'd4', task_id: null, text: '라'.repeat(400), source: { type: 'ai-controlled', model: 'm1' }, contamination: { contaminated: true } },
  ];
  const { chosen } = selectSample(docs, tasks, { seed: 'x', size: 30 });
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].task.id, 't1');
});
