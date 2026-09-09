// unslop TUI. 파일 하나의 발견을 목록으로 보여 주고, 선택한 발견의 문맥을 강조하며, 수정 제안을 적용·되돌리기·저장한다.
// Node 내장 readline과 ANSI 이스케이프만 쓴다. 화면 그리기는 순수 함수(renderFrame)로 분리해 테스트한다.
import { readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
import { check } from './core.mjs';
import { cps } from './text.mjs';

const ESC = '\x1b[';
const S = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, inverse: `${ESC}7m`,
  red: `${ESC}31m`, yellow: `${ESC}33m`, green: `${ESC}32m`, cyan: `${ESC}36m`, blue: `${ESC}34m`,
  hl: `${ESC}43m${ESC}30m`, // 강조: 노란 배경, 검은 글자
};

// 동아시아 문자는 폭 2로 센다.
export function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0x1100) return 1;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
}
export const displayWidth = (s) => cps(s).reduce((w, ch) => w + charWidth(ch), 0);

// 폭에 맞춰 자른다. 넘치면 …을 붙인다.
export function truncate(s, width) {
  const c = cps(s);
  let w = 0;
  let i = 0;
  for (; i < c.length; i += 1) { const cw = charWidth(c[i]); if (w + cw > width - 1) break; w += cw; }
  if (i >= c.length) return s;
  return c.slice(0, i).join('') + '…';
}

// 코드 포인트 배열을 폭에 맞춰 줄바꿈한다. 각 셀은 {ch, index}로 원문 위치를 유지해 강조에 쓴다.
export function wrapCells(cells, width) {
  const lines = [];
  let cur = [];
  let w = 0;
  for (const cell of cells) {
    if (cell.ch === '\n') { lines.push(cur); cur = []; w = 0; continue; }
    const cw = charWidth(cell.ch);
    if (w + cw > width) { lines.push(cur); cur = []; w = 0; }
    cur.push(cell);
    w += cw;
  }
  lines.push(cur);
  return lines;
}

const severityColor = (sev) => (sev === 'warning' ? S.yellow : S.cyan);

// 화면 한 장을 문자열 배열로 만든다. state: { file, text, findings, index, filter, dirty, message, applied }
export function renderFrame(state, cols, rows) {
  const out = [];
  const visible = state.findings.filter((f) => state.filter === 'all' || f.severity === 'warning');
  const idx = Math.min(state.index, Math.max(0, visible.length - 1));
  const sel = visible[idx];
  const warnings = state.findings.filter((f) => f.severity === 'warning').length;

  // 헤더
  const title = `${S.bold}unslop${S.reset} ${state.file}${state.dirty ? ` ${S.red}*${S.reset}` : ''}`;
  const stats = `${S.yellow}${warnings} warning${S.reset} · ${S.cyan}${state.findings.length - warnings} info${S.reset} · 적용 ${state.applied} · 필터: ${state.filter === 'all' ? '전체' : 'warning만'}`;
  out.push(truncate(`${title}  ${stats}`, cols + 60));
  out.push(S.dim + '─'.repeat(Math.max(1, cols)) + S.reset);

  // 목록 영역: 화면의 40%
  const listRows = Math.max(3, Math.floor((rows - 8) * 0.4));
  const first = Math.max(0, Math.min(idx - Math.floor(listRows / 2), visible.length - listRows));
  if (!visible.length) out.push(`${S.green}발견 없음${S.reset}`);
  for (let i = first; i < Math.min(visible.length, first + listRows); i += 1) {
    const f = visible[i];
    const mark = i === idx ? `${S.inverse}▶` : ' ';
    const line = `${mark} ${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} ${severityColor(f.severity)}${f.severity.padEnd(7)}${S.reset} ${f.ruleId} ${f.fixable ? `${S.green}fix${S.reset}` : '   '} ${f.quote.replace(/\n/g, ' ')}`;
    out.push(truncate(line, cols + (i === idx ? 20 : 15)) + (i === idx ? S.reset : ''));
  }
  for (let i = visible.length - first; i < listRows; i += 1) out.push('');
  out.push(S.dim + '─'.repeat(Math.max(1, cols)) + S.reset);

  // 상세와 문맥
  const detailRows = rows - out.length - 2;
  if (sel) {
    out.push(truncate(`${S.bold}${sel.ruleId} ${sel.name}${S.reset} → ${sel.taxonomy}  ${severityColor(sel.severity)}${sel.severity}${S.reset}`, cols + 30));
    for (const l of wrapCells(cps(sel.message).map((ch) => ({ ch })), cols)) out.push(l.map((c) => c.ch).join(''));
    if (sel.fix) {
      const before = cps(state.text).slice(sel.fix.start, sel.fix.end).join('').replace(/\n/g, '↵');
      out.push(truncate(`${S.green}수정 제안:${S.reset} "${before}" → "${sel.fix.replacement || '(삭제)'}"`, cols + 10));
    }
    out.push('');
    // 문맥: 발견 앞뒤 200자, 줄바꿈 유지, 발견 구간과 관련 구간 강조
    const all = cps(state.text);
    const from = Math.max(0, sel.start - 200);
    const to = Math.min(all.length, Math.max(sel.end, sel.start + 1) + 200);
    const cells = [];
    for (let i = from; i < to; i += 1) cells.push({ ch: all[i], index: i });
    const remaining = out.length + 1 < rows - 1 ? rows - 1 - out.length - 1 : 0;
    const wrapped = wrapCells(cells, cols - 2);
    // 발견이 있는 줄이 보이도록 창을 잡는다.
    const hitLine = Math.max(0, wrapped.findIndex((l) => l.some((c) => c.index >= sel.start && c.index < sel.end)));
    const startLine = Math.max(0, Math.min(hitLine - Math.floor(remaining / 2), wrapped.length - remaining));
    for (const l of wrapped.slice(startLine, startLine + Math.max(0, remaining))) {
      let s = '  ';
      let on = false;
      let onRel = false;
      for (const c of l) {
        const inHit = c.index >= sel.start && c.index < sel.end;
        const inRel = sel.related && c.index >= sel.related.start && c.index < sel.related.end;
        if (inHit !== on || inRel !== onRel) { s += inHit ? S.hl : inRel ? `${S.reset}${S.blue}${S.inverse}` : S.reset; on = inHit; onRel = inRel; }
        s += c.ch;
      }
      out.push(s + S.reset);
    }
  }
  while (out.length < rows - 1) out.push('');
  const help = state.message
    ? `${S.yellow}${state.message}${S.reset}`
    : `${S.dim}↑↓ 이동  a 수정 적용  A 모두 적용  u 되돌리기  s 저장  w 필터  r 재검사  q 종료${S.reset}`;
  out.push(truncate(help, cols + 20));
  return out.slice(0, rows);
}

export function applyFix(text, fx) {
  const arr = cps(text);
  arr.splice(fx.start, fx.end - fx.start, ...cps(fx.replacement));
  return arr.join('');
}

export function runTui(file, options = {}) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('TUI는 터미널에서만 실행할 수 있습니다.');
  const original = readFileSync(file, 'utf8');
  const state = { file, text: check(original).text, findings: [], index: 0, filter: 'all', dirty: false, message: '', applied: 0, undo: [] };
  const recheck = () => { state.findings = check(state.text, options).findings; };
  recheck();

  const draw = () => {
    const cols = stdout.columns || 100;
    const rows = stdout.rows || 30;
    const frame = renderFrame(state, cols, rows);
    stdout.write(`${ESC}H${ESC}2J${frame.join('\n')}`);
  };
  const visible = () => state.findings.filter((f) => state.filter === 'all' || f.severity === 'warning');
  const clamp = () => { state.index = Math.max(0, Math.min(state.index, visible().length - 1)); };
  const apply = (f) => {
    if (!f?.fix) { state.message = '이 발견에는 자동 수정이 없습니다.'; return false; }
    state.undo.push(state.text);
    state.text = applyFix(state.text, f.fix);
    state.dirty = true;
    state.applied += 1;
    return true;
  };

  stdout.write(`${ESC}?1049h${ESC}?25l`); // 대체 화면, 커서 숨김
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  let quitArmed = false;
  const exit = () => {
    stdin.setRawMode(false);
    stdout.write(`${ESC}?25h${ESC}?1049l`);
    process.exit(0);
  };
  stdout.on('resize', draw);
  stdin.on('keypress', (str, key) => {
    state.message = '';
    const name = key?.name;
    if (key?.ctrl && name === 'c') exit();
    if (name === 'down' || name === 'j') state.index += 1;
    else if (name === 'up' || name === 'k') state.index -= 1;
    else if (name === 'pagedown') state.index += 10;
    else if (name === 'pageup') state.index -= 10;
    else if (name === 'home') state.index = 0;
    else if (name === 'end') state.index = visible().length - 1;
    else if (str === 'a') { if (apply(visible()[state.index])) { recheck(); state.message = '수정을 적용했습니다. s로 저장하세요.'; } }
    else if (str === 'A') {
      let n = 0;
      for (let round = 0; round < 3; round += 1) {
        const fixes = state.findings.filter((f) => f.fix).sort((a, b) => b.fix.start - a.fix.start);
        let last = Infinity;
        const chosen = fixes.filter((f) => { if (f.fix.end <= last) { last = f.fix.start; return true; } return false; });
        if (!chosen.length) break;
        state.undo.push(state.text);
        for (const f of chosen) state.text = applyFix(state.text, f.fix);
        n += chosen.length;
        state.dirty = true;
        state.applied += chosen.length;
        recheck();
      }
      state.message = n ? `${n}곳을 수정했습니다. s로 저장하세요.` : '적용할 수정이 없습니다.';
    }
    else if (str === 'u') { if (state.undo.length) { state.text = state.undo.pop(); state.applied = Math.max(0, state.applied - 1); state.dirty = state.text !== check(original).text; recheck(); state.message = '되돌렸습니다.'; } else state.message = '되돌릴 것이 없습니다.'; }
    else if (str === 's') { writeFileSync(file, state.text); state.dirty = false; state.message = `${file}에 저장했습니다.`; }
    else if (str === 'w') { state.filter = state.filter === 'all' ? 'warning' : 'all'; }
    else if (str === 'r') { recheck(); state.message = '다시 검사했습니다.'; }
    else if (str === 'q') {
      if (state.dirty && !quitArmed) { quitArmed = true; state.message = '저장하지 않은 수정이 있습니다. 다시 q를 누르면 버리고 종료합니다. s는 저장.'; }
      else exit();
    }
    if (str !== 'q') quitArmed = false;
    clamp();
    draw();
  });
  draw();
}
