import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { charWidth, displayWidth, truncate, wrapCells, stripAnsi, render, createState, openDocument, handleKey, applyFix, listDir, HOME_MENU } from './src/tui.mjs';

const plain = (frame) => frame.map(stripAnsi).join('\n');
const key = (name, extra = {}) => ({ name, ...extra });

function fixture(text = '아래에서 기한을 안내해 드리겠습니다. 기한은 금요일입니다. 또한 A입니다. 또한 B입니다.') {
  const dir = mkdtempSync(join(tmpdir(), 'unslop-tui-'));
  const file = join(dir, 'doc.md');
  writeFileSync(file, text);
  writeFileSync(join(dir, 'other.txt'), '깨끗한 문장입니다.');
  return { dir, file };
}

test('동아시아 문자 폭, 자르기, 줄바꿈', () => {
  assert.equal(charWidth('가'), 2);
  assert.equal(displayWidth('가나a'), 5);
  assert.equal(stripAnsi(truncate('가나다라마', 6)), '가나…');
  assert.equal(truncate('abc', 10), 'abc');
  // ANSI 코드는 폭에 세지 않는다.
  assert.equal(stripAnsi(truncate('\x1b[33m가나다\x1b[0m', 10)), '가나다');
  const lines = wrapCells([...'가나다\n라마'].map((ch, i) => ({ ch, index: i })), 4);
  assert.deepEqual(lines.map((l) => l.map((c) => c.ch).join('')), ['가나', '다', '라마']);
});

test('홈 화면: 메뉴 이동과 선택으로 각 화면에 들어가고 Esc로 돌아온다', () => {
  const state = createState(process.cwd());
  let frame = render(state, 100, 30);
  assert.equal(frame.length, 30);
  assert.match(plain(frame), /파일 열기/);
  handleKey(state, null, key('down'));
  handleKey(state, null, key('down'));
  assert.equal(HOME_MENU[state.home.index].key, 'rules');
  handleKey(state, null, key('return'));
  assert.equal(state.screen, 'rules');
  assert.match(plain(render(state, 100, 30)), /UNS001/);
  handleKey(state, null, key('escape'));
  assert.equal(state.screen, 'home');
  handleKey(state, '?', {});
  assert.equal(state.screen, 'help');
  assert.match(plain(render(state, 100, 30)), /자동 수정의 범위/);
  handleKey(state, null, key('escape'));
  assert.equal(handleKey(state, 'q', {}), 'quit');
});

test('규칙 화면: Space로 규칙을 끄면 검사에서 빠진다', () => {
  const { dir, file } = fixture();
  const state = createState(dir);
  openDocument(state, file);
  assert.ok(state.doc.findings.some((f) => f.ruleId === 'UNS008'));
  state.screen = 'rules';
  state.rules.index = 7; // UNS008
  handleKey(state, ' ', key('space'));
  assert.ok(state.disabled.has('UNS008'));
  assert.ok(!state.doc.findings.some((f) => f.ruleId === 'UNS008'));
  assert.match(plain(render(state, 100, 30)), /9\/10 켜짐/);
});

test('파일 탐색: 폴더 목록, 열기, 폴더 전체 검사', () => {
  const { dir, file } = fixture();
  const entries = listDir(dir);
  assert.deepEqual(entries.map((e) => e.name), ['..', 'doc.md', 'other.txt']);
  const state = createState(dir);
  handleKey(state, null, key('return')); // 파일 열기 메뉴
  assert.equal(state.screen, 'browser');
  handleKey(state, 'c', {});
  assert.equal(state.browser.stats['doc.md'].warnings > 0, true);
  assert.equal(state.browser.stats['other.txt'].warnings, 0);
  assert.match(plain(render(state, 120, 30)), /doc\.md.*warning/);
  state.browser.index = 1;
  handleKey(state, null, key('return'));
  assert.equal(state.screen, 'findings');
  assert.equal(state.doc.path, file);
  // 경로 입력으로도 연다.
  handleKey(state, null, key('escape'));
  handleKey(state, '/', {});
  for (const ch of 'other.txt') handleKey(state, ch, {});
  handleKey(state, null, key('return'));
  assert.equal(state.doc.name, 'other.txt');
  assert.match(plain(render(state, 100, 30)), /발견 없음/);
});

test('검사 결과: 수정 적용·되돌리기·diff·저장이 파일에 반영된다', () => {
  const { dir, file } = fixture();
  const state = createState(dir);
  openDocument(state, file);
  const frame = render(state, 100, 30);
  const text = plain(frame);
  assert.match(text, /UNS008/);
  assert.match(text, /수정 제안/);
  assert.ok(frame.some((l) => l.includes('\x1b[43m')), '발견 구간 강조');

  handleKey(state, 'a', {});
  assert.ok(state.doc.dirty);
  assert.ok(!state.doc.text.startsWith('아래에서'));
  handleKey(state, 'u', {});
  assert.ok(!state.doc.dirty);
  handleKey(state, 'A', {});
  assert.equal(state.doc.text, '기한은 금요일입니다. 또한 A입니다. B입니다.');
  handleKey(state, 'd', {});
  assert.equal(state.screen, 'diff');
  assert.match(plain(render(state, 100, 30)), /- 아래에서/);
  handleKey(state, 's', {});
  assert.equal(readFileSync(file, 'utf8'), '기한은 금요일입니다. 또한 A입니다. B입니다.');
  assert.ok(!state.doc.dirty);
  handleKey(state, null, key('escape'));
  assert.equal(state.screen, 'findings');
});

test('검사 결과: 저장하지 않은 수정이 있으면 Esc와 q를 한 번 더 요구한다', () => {
  const { dir, file } = fixture();
  const state = createState(dir);
  openDocument(state, file);
  handleKey(state, 'A', {});
  handleKey(state, null, key('escape'));
  assert.equal(state.screen, 'findings');
  assert.match(state.message, /저장하지 않은/);
  handleKey(state, null, key('escape'));
  assert.equal(state.screen, 'home');
  openDocument(state, file);
  handleKey(state, 'A', {});
  assert.equal(handleKey(state, 'q', {}), null);
  assert.equal(handleKey(state, 'q', {}), 'quit');
});

test('필터: w와 f로 목록을 좁힌다', () => {
  const { dir, file } = fixture('이번 개편은 다양한 관점에서 원인을 분석합니다. 또한 A입니다. 또한 B입니다.');
  const state = createState(dir);
  openDocument(state, file);
  const all = state.doc.findings.length;
  handleKey(state, 'w', {});
  assert.match(plain(render(state, 100, 30)), /필터 warning/);
  handleKey(state, 'w', {});
  handleKey(state, 'f', {});
  assert.equal(state.doc.ruleFilter, 'UNS001');
  assert.ok(all > 1);
});

test('applyFix는 코드 포인트 좌표로 치환한다', () => {
  assert.equal(applyFix('😀 또한 A. 또한 B.', { start: 8, end: 11, replacement: '' }), '😀 또한 A. B.');
});
