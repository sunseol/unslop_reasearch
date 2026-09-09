import { test } from 'node:test';
import assert from 'node:assert/strict';
import { charWidth, displayWidth, truncate, wrapCells, renderFrame, applyFix } from './src/tui.mjs';
import { check } from './src/core.mjs';

const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

test('동아시아 문자 폭과 자르기', () => {
  assert.equal(charWidth('가'), 2);
  assert.equal(charWidth('a'), 1);
  assert.equal(displayWidth('가나a'), 5);
  assert.equal(truncate('가나다라마', 6), '가나…');
  assert.equal(truncate('abc', 10), 'abc');
});

test('wrapCells: 폭을 넘기면 줄을 나누고 줄바꿈 문자를 존중한다', () => {
  const cells = [...'가나다\n라마'].map((ch, i) => ({ ch, index: i }));
  const lines = wrapCells(cells, 4);
  assert.deepEqual(lines.map((l) => l.map((c) => c.ch).join('')), ['가나', '다', '라마']);
  assert.equal(lines[2][0].index, 4);
});

test('renderFrame: 발견 목록·상세·문맥·도움말을 화면 크기 안에 그린다', () => {
  const text = '아래에서 기한을 안내해 드리겠습니다. 기한은 금요일입니다. 또한 A입니다. 또한 B입니다.';
  const r = check(text);
  const state = { file: 'x.md', text: r.text, findings: r.findings, index: 0, filter: 'all', dirty: true, message: '', applied: 0 };
  const frame = renderFrame(state, 80, 24);
  assert.equal(frame.length, 24);
  const plain = frame.map(strip).join('\n');
  assert.match(plain, /unslop x\.md \*/);
  assert.match(plain, /warning/);
  assert.match(plain, /UNS008/);
  assert.match(plain, /수정 제안/);
  assert.match(plain, /↑↓ 이동/);
  // 강조 색이 문맥 안에 들어간다.
  assert.ok(frame.some((l) => l.includes('\x1b[43m')));
});

test('renderFrame: 발견이 없을 때와 warning 필터', () => {
  const state = { file: 'y.md', text: '깨끗한 문장입니다.', findings: [], index: 0, filter: 'warning', dirty: false, message: '저장했습니다.', applied: 0 };
  const plain = renderFrame(state, 60, 12).map(strip).join('\n');
  assert.match(plain, /발견 없음/);
  assert.match(plain, /warning만/);
  assert.match(plain, /저장했습니다/);
});

test('applyFix는 코드 포인트 좌표로 치환한다', () => {
  assert.equal(applyFix('😀 또한 A. 또한 B.', { start: 8, end: 11, replacement: '' }), '😀 또한 A. B.');
});
