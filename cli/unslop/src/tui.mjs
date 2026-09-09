// unslop TUI. 홈 → 파일 탐색 → 검사 결과 → diff/규칙/도움말 화면을 하나의 앱으로 묶는다.
// Node 내장 readline과 ANSI 이스케이프만 쓴다. 화면 그리기는 순수 함수로 분리해 테스트한다.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename, relative, sep } from 'node:path';
import readline from 'node:readline';
import { check, diffLines, VERSION } from './core.mjs';
import { RULES_KO } from './rules-ko.mjs';
import { cps } from './text.mjs';

// ---------- 스타일 ----------
const ESC = '\x1b[';
export const S = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, inverse: `${ESC}7m`,
  red: `${ESC}31m`, yellow: `${ESC}33m`, green: `${ESC}32m`, cyan: `${ESC}36m`, blue: `${ESC}34m`, magenta: `${ESC}35m`,
  hl: `${ESC}43m${ESC}30m`, rel: `${ESC}44m${ESC}37m`, sel: `${ESC}7m`,
};
const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.text', '.rst', '.adoc', '.html', '.htm', '.json', '.yaml', '.yml', '.csv']);

// ---------- 폭·자르기·줄바꿈 ----------
export function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0x1100) return 1;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}
export const displayWidth = (s) => cps(stripAnsi(s)).reduce((w, ch) => w + charWidth(ch), 0);
export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

// ANSI 코드를 보존하면서 표시 폭에 맞춰 자른다.
export function truncate(s, width) {
  if (displayWidth(s) <= width) return s;
  let w = 0;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const m = s.slice(i).match(/^\x1b\[[0-9;?]*[A-Za-z]/);
    if (m) { out += m[0]; i += m[0].length; continue; }
    const ch = String.fromCodePoint(s.codePointAt(i));
    const cw = charWidth(ch);
    if (w + cw > width - 1) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  return `${out}…${S.reset}`;
}
export const padEnd = (s, width) => s + ' '.repeat(Math.max(0, width - displayWidth(s)));

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
export const wrapText = (text, width) => wrapCells(cps(text).map((ch) => ({ ch })), width).map((l) => l.map((c) => c.ch).join(''));

// ---------- 공통 프레임 ----------
const sevColor = (sev) => (sev === 'warning' ? S.yellow : S.cyan);
const hr = (cols) => `${S.dim}${'─'.repeat(Math.max(1, cols))}${S.reset}`;

function frame(title, right, body, footer, cols, rows) {
  const out = [];
  const head = `${S.bold}${S.magenta} unslop ${S.reset}${S.dim}${VERSION}${S.reset}  ${title}`;
  out.push(truncate(`${padEnd(head, Math.max(0, cols - displayWidth(right) - 1))} ${right}`, cols));
  out.push(hr(cols));
  for (const line of body.slice(0, rows - 4)) out.push(truncate(line, cols));
  while (out.length < rows - 2) out.push('');
  out.push(hr(cols));
  out.push(truncate(footer, cols));
  return out.slice(0, rows);
}

const keyHelp = (pairs) => pairs.map(([k, v]) => `${S.bold}${k}${S.reset}${S.dim} ${v}${S.reset}`).join('   ');

// ---------- 홈 ----------
export const HOME_MENU = [
  { key: 'open', label: '파일 열기', desc: '폴더를 탐색해 문서를 검사합니다' },
  { key: 'path', label: '경로 입력', desc: '파일 경로를 직접 입력합니다' },
  { key: 'rules', label: '규칙', desc: '규칙 10개를 보고 켜거나 끕니다' },
  { key: 'help', label: '도움말', desc: '키와 판정 원칙' },
  { key: 'quit', label: '종료', desc: '' },
];

export function renderHome(state, cols, rows) {
  const body = [''];
  const logo = ['  ██╗   ██╗███╗   ██╗███████╗██╗      ██████╗ ██████╗ ', '  ██║   ██║████╗  ██║██╔════╝██║     ██╔═══██╗██╔══██╗', '  ██║   ██║██╔██╗ ██║███████╗██║     ██║   ██║██████╔╝', '  ██║   ██║██║╚██╗██║╚════██║██║     ██║   ██║██╔═══╝ ', '  ╚██████╔╝██║ ╚████║███████║███████╗╚██████╔╝██║     ', '   ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚══════╝ ╚═════╝ ╚═╝     '];
  if (cols >= 60 && rows >= 20) body.push(...logo.map((l) => `${S.magenta}${l}${S.reset}`), '');
  body.push(`  ${S.dim}한국어 문서의 slop 단서를 찾고, 의미를 보존하는 범위에서 제거합니다.${S.reset}`, `  ${S.dim}AI 판별기가 아닙니다. 사람이 쓴 글에도 같은 기준을 적용합니다.${S.reset}`, '');
  HOME_MENU.forEach((m, i) => {
    const on = i === state.home.index;
    const enabled = state.disabled.size ? `${S.dim}(${RULES_KO.length - state.disabled.size}/${RULES_KO.length} 켜짐)${S.reset}` : '';
    body.push(`  ${on ? `${S.sel} ▶ ${padEnd(m.label, 10)} ${S.reset}` : `   ${padEnd(m.label, 10)}  `} ${S.dim}${m.desc}${S.reset} ${m.key === 'rules' ? enabled : ''}`);
  });
  if (state.recent.length) {
    body.push('', `  ${S.bold}최근 파일${S.reset}`);
    state.recent.slice(0, 5).forEach((f, i) => body.push(`  ${S.dim}${i + 1}${S.reset} ${f}`));
  }
  const footer = state.message ? `${S.yellow}${state.message}${S.reset}` : keyHelp([['↑↓', '이동'], ['Enter', '선택'], ['1-5', '최근 파일'], ['?', '도움말'], ['q', '종료']]);
  return frame('홈', `${S.dim}${state.cwd}${S.reset}`, body, footer, cols, rows);
}

// ---------- 파일 탐색 ----------
export function listDir(dir) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { entries = []; }
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map((e) => ({ name: e.name, dir: true }));
  const files = entries.filter((e) => e.isFile() && TEXT_EXT.has(extOf(e.name))).map((e) => ({ name: e.name, dir: false }));
  const sortKo = (a, b) => a.name.localeCompare(b.name, 'ko');
  return [{ name: '..', dir: true, up: true }, ...dirs.sort(sortKo), ...files.sort(sortKo)];
}
const extOf = (name) => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i).toLowerCase(); };

export function renderBrowser(state, cols, rows) {
  const b = state.browser;
  const body = [];
  const listRows = rows - 6;
  const first = Math.max(0, Math.min(b.index - Math.floor(listRows / 2), b.entries.length - listRows));
  for (let i = first; i < Math.min(b.entries.length, first + listRows); i += 1) {
    const e = b.entries[i];
    const on = i === b.index;
    const icon = e.dir ? `${S.blue}▸${S.reset}` : ' ';
    const name = e.dir ? `${S.blue}${e.name}/${S.reset}` : e.name;
    const stat = !e.dir && b.stats[e.name] ? `${S.dim}${b.stats[e.name].chars}자${S.reset}  ${b.stats[e.name].warnings ? S.yellow : S.green}${b.stats[e.name].warnings} warning${S.reset}  ${S.dim}밀도 ${b.stats[e.name].density}${S.reset}` : '';
    const line = `${on ? `${S.sel} ▶ ` : '   '}${icon} ${padEnd(name, Math.min(48, cols - 40))}${on ? S.reset : ''} ${stat}`;
    body.push(line);
  }
  if (b.input !== null) body.push('', `  ${S.bold}경로:${S.reset} ${b.input}${S.inverse} ${S.reset}`);
  const footer = state.message ? `${S.yellow}${state.message}${S.reset}` : b.input !== null
    ? keyHelp([['Enter', '열기'], ['Esc', '취소']])
    : keyHelp([['↑↓', '이동'], ['Enter', '열기'], ['Backspace', '상위 폴더'], ['/', '경로 입력'], ['c', '폴더 전체 검사'], ['Esc', '홈']]);
  return frame(`파일 열기  ${S.dim}${b.dir}${S.reset}`, `${S.dim}${b.entries.length - 1}개${S.reset}`, body, footer, cols, rows);
}

// ---------- 검사 결과 ----------
export function visibleFindings(doc) {
  return doc.findings.filter((f) => (doc.filter === 'all' || f.severity === 'warning') && (!doc.ruleFilter || f.ruleId === doc.ruleFilter));
}

export function renderFindings(state, cols, rows) {
  const doc = state.doc;
  const visible = visibleFindings(doc);
  const idx = Math.min(doc.index, Math.max(0, visible.length - 1));
  const sel = visible[idx];
  const warnings = doc.findings.filter((f) => f.severity === 'warning').length;
  const body = [];

  const listRows = Math.max(3, Math.floor((rows - 6) * 0.4));
  const first = Math.max(0, Math.min(idx - Math.floor(listRows / 2), visible.length - listRows));
  if (!visible.length) body.push(`  ${S.green}${doc.findings.length ? '필터에 맞는 발견이 없습니다.' : '발견 없음. 검사한 규칙에서 단서를 찾지 못했습니다.'}${S.reset}`);
  for (let i = first; i < Math.min(visible.length, first + listRows); i += 1) {
    const f = visible[i];
    const on = i === idx;
    const line = `${on ? `${S.sel} ▶ ` : '   '}${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} ${sevColor(f.severity)}${f.severity.padEnd(7)}${S.reset} ${f.ruleId} ${f.fixable ? `${S.green}fix${S.reset}` : '   '} ${S.dim}${f.quote.replace(/\n/g, ' ')}${S.reset}${on ? S.reset : ''}`;
    body.push(line);
  }
  for (let i = body.length; i < listRows; i += 1) body.push('');
  if (visible.length > listRows) body.push(`  ${S.dim}${first + 1}–${Math.min(visible.length, first + listRows)} / ${visible.length}${S.reset}`);
  else body.push('');
  body.push(hr(cols));

  if (sel) {
    body.push(`  ${S.bold}${sel.ruleId} ${sel.name}${S.reset} → ${S.magenta}${sel.taxonomy}${S.reset}  ${sevColor(sel.severity)}${sel.severity}${S.reset}`);
    for (const l of wrapText(sel.message, cols - 4)) body.push(`  ${l}`);
    if (sel.fix) {
      const before = cps(doc.text).slice(sel.fix.start, sel.fix.end).join('').replace(/\n/g, '↵');
      body.push(`  ${S.green}수정 제안${S.reset}  "${before}" → "${sel.fix.replacement || `${S.dim}(삭제)${S.reset}`}"`);
    } else body.push(`  ${S.dim}자동 수정 없음. 문맥을 보고 직접 판단합니다.${S.reset}`);
    body.push('');
    const remaining = rows - 4 - body.length;
    const all = cps(doc.text);
    const from = Math.max(0, sel.start - 240);
    const to = Math.min(all.length, Math.max(sel.end, sel.start + 1) + 240);
    const cells = [];
    for (let i = from; i < to; i += 1) cells.push({ ch: all[i], index: i });
    const wrapped = wrapCells(cells, cols - 4);
    const hitLine = Math.max(0, wrapped.findIndex((l) => l.some((c) => c.index >= sel.start && c.index < sel.end)));
    const startLine = Math.max(0, Math.min(hitLine - Math.floor(remaining / 2), wrapped.length - remaining));
    for (const l of wrapped.slice(startLine, startLine + Math.max(0, remaining))) {
      let s = '  ';
      let mode = '';
      for (const c of l) {
        const m = c.index >= sel.start && c.index < sel.end ? 'hit' : sel.related && c.index >= sel.related.start && c.index < sel.related.end ? 'rel' : '';
        if (m !== mode) { s += m === 'hit' ? S.hl : m === 'rel' ? S.rel : S.reset; mode = m; }
        s += c.ch;
      }
      body.push(s + S.reset);
    }
  }
  const right = `${S.yellow}${warnings} warning${S.reset} · ${S.cyan}${doc.findings.length - warnings} info${S.reset} · 밀도 ${doc.density} · 필터 ${doc.filter === 'all' ? '전체' : 'warning'}${doc.ruleFilter ? `/${doc.ruleFilter}` : ''}${doc.dirty ? ` · ${S.red}저장 안 됨${S.reset}` : ''}`;
  const footer = state.message ? `${S.yellow}${state.message}${S.reset}` : keyHelp([['↑↓', '이동'], ['a', '수정'], ['A', '모두'], ['u', '되돌리기'], ['s', '저장'], ['d', 'diff'], ['w', 'warning만'], ['f', '규칙별'], ['r', '재검사'], ['Esc', '뒤로']]);
  return frame(`${doc.name}${doc.dirty ? ` ${S.red}*${S.reset}` : ''}`, right, body, footer, cols, rows);
}

// ---------- diff ----------
export function renderDiff(state, cols, rows) {
  const doc = state.doc;
  const lines = doc.dirty ? diffLines(doc.original, doc.text).split('\n') : [`  ${S.dim}변경 사항이 없습니다.${S.reset}`];
  const colored = lines.map((l) => (l.startsWith('- ') ? `${S.red}${l}${S.reset}` : l.startsWith('+ ') ? `${S.green}${l}${S.reset}` : `${S.dim}${l}${S.reset}`));
  const view = rows - 6;
  const first = Math.max(0, Math.min(state.scroll, colored.length - view));
  const footer = state.message ? `${S.yellow}${state.message}${S.reset}` : keyHelp([['↑↓', '스크롤'], ['s', '저장'], ['Esc', '뒤로']]);
  return frame(`diff  ${S.dim}${doc.name}${S.reset}`, `${S.dim}${first + 1}–${Math.min(colored.length, first + view)} / ${colored.length}${S.reset}`, colored.slice(first, first + view), footer, cols, rows);
}

// ---------- 규칙 ----------
export function renderRules(state, cols, rows) {
  const body = [];
  RULES_KO.forEach((r, i) => {
    const on = i === state.rules.index;
    const enabled = !state.disabled.has(r.id);
    body.push(`${on ? `${S.sel} ▶ ` : '   '}${enabled ? `${S.green}●${S.reset}` : `${S.dim}○${S.reset}`} ${r.id} ${padEnd(r.name, 22)} → ${padEnd(r.taxonomy, 24)} ${sevColor(r.severity)}${r.severity}${S.reset}${r.fixable ? `  ${S.green}fixable${S.reset}` : ''}${on ? S.reset : ''}`);
  });
  body.push('', hr(cols));
  const r = RULES_KO[state.rules.index];
  const desc = RULE_DESC[r.id] ?? '';
  body.push(`  ${S.bold}${r.id} ${r.name}${S.reset}`);
  for (const l of wrapText(desc, cols - 4)) body.push(`  ${l}`);
  const footer = state.message ? `${S.yellow}${state.message}${S.reset}` : keyHelp([['↑↓', '이동'], ['Space', '켜기/끄기'], ['Esc', '뒤로']]);
  return frame('규칙', `${S.dim}${RULES_KO.length - state.disabled.size}/${RULES_KO.length} 켜짐${S.reset}`, body, footer, cols, rows);
}

export const RULE_DESC = {
  UNS001: '상투적 표현 목록(“다양한 관점에서”, “보다 효율적인” 등)을 찾습니다. 단어 하나만으로는 표시하지 않습니다. 뒤에 구체적 내용이 따라오면 정상입니다. info, 자동 수정 없음.',
  UNS002: '연속 문장이 같은 접속어로 시작하면 두 번째부터 표시하고 삭제를 제안합니다. 연속 반복은 문장 관계를 표시하지 못합니다. 문서 전체 밀도가 높으면 info로 한 번 알립니다.',
  UNS003: '문장 3개 이상이 같은 첫 어절로 시작하면 표시합니다. 같은 틀이 내용의 차이나 수행 조건을 가릴 수 있습니다. 비교를 돕는 반복은 정상입니다.',
  UNS004: '한 문장에 유보 표현이 2개 이상 겹치면 표시합니다. 자동 수정은 “수 있을 것으로 보입니다” → “것으로 보입니다” 하나만 제안하며, 조건·권한·기능의 “할 수 있다”는 건드리지 않습니다.',
  UNS005: '추상 명사(…화/성/방안/역량 등)가 3개 이상 이어지는 어절 연쇄를 찾습니다. 누가 무엇을 하는지가 문맥에 있는지 확인하세요. info.',
  UNS006: '앞 문장과 내용이 크게 겹치는 문장을 표시합니다. 재진술 표지(“즉”, “다시 말해”)가 있으면 더 낮은 겹침에도 표시합니다. 겹침이 매우 크면 삭제를 제안합니다. 새 조건·근거를 더하는 문장은 정상입니다.',
  UNS007: '문장 4개 이상이 같은 끝말로 이어지면 표시합니다. 필수·선택·조건 같은 항목별 차이가 같은 틀에 묻히는지 확인하세요. info.',
  UNS008: '“아래에서 … 안내해 드리겠습니다” 같은 예고 문장을 찾습니다. 1,500자 미만 글에서는 warning과 삭제 제안, 긴 글에서는 info입니다. 예의를 전하는 마무리는 대상이 아닙니다.',
  UNS009: '평가만 있고 대상·근거가 없는 문장(“이는 매우 중요한 부분입니다”)을 찾습니다. info, 자동 수정 없음.',
  UNS010: '문장 3개 안에 같은 어간이 5회 이상 나오면 알립니다. 주제어 반복은 정상이므로 info만 냅니다.',
};

// ---------- 도움말 ----------
export function renderHelp(state, cols, rows) {
  const body = [
    `  ${S.bold}unslop은 무엇을 하나${S.reset}`,
    ...wrapText('한국어 문서에서 slop 단서(공허한 표현, 불필요한 반복·연결·유보, 과도한 안내)를 찾아 보고합니다. 문맥 없이도 방해가 분명한 경우만 warning이고, 나머지는 info로 “확인할 것”만 알립니다. 판정은 사람이 합니다.', cols - 4).map((l) => `  ${l}`),
    '',
    `  ${S.bold}자동 수정의 범위${S.reset}`,
    ...wrapText('의미·조건·책임·불확실성이 바뀌지 않는 삭제만 제안합니다. 예고 문장 삭제, 두 번째 이후 반복 접속어 삭제, 겹친 유보 줄이기, 겹침이 큰 재진술 삭제. 사실을 채우는 수정은 하지 않습니다. 파일은 s를 누를 때만 바뀝니다.', cols - 4).map((l) => `  ${l}`),
    '',
    `  ${S.bold}키${S.reset}`,
    `  ${padEnd('↑↓ j k PgUp PgDn Home End', 30)} 이동`,
    `  ${padEnd('Enter', 30)} 선택·열기`,
    `  ${padEnd('a / A', 30)} 선택한 수정 적용 / 적용 가능한 수정 모두 적용`,
    `  ${padEnd('u', 30)} 되돌리기`,
    `  ${padEnd('s', 30)} 파일에 저장`,
    `  ${padEnd('d', 30)} 원본과의 diff 보기`,
    `  ${padEnd('w / f', 30)} warning만 보기 / 규칙별로 보기`,
    `  ${padEnd('r', 30)} 다시 검사`,
    `  ${padEnd('c (파일 탐색에서)', 30)} 현재 폴더의 문서 전체 검사`,
    `  ${padEnd('Esc', 30)} 이전 화면`,
    `  ${padEnd('?', 30)} 이 도움말`,
    `  ${padEnd('q', 30)} 종료 (저장하지 않은 수정이 있으면 한 번 더)`,
    '',
    `  ${S.dim}명령줄: unslop check <file> [--format json] · unslop fix <file> [--write] · unslop rules${S.reset}`,
  ];
  return frame('도움말', '', body, keyHelp([['Esc', '뒤로']]), cols, rows);
}

export function render(state, cols, rows) {
  switch (state.screen) {
    case 'home': return renderHome(state, cols, rows);
    case 'browser': return renderBrowser(state, cols, rows);
    case 'findings': return renderFindings(state, cols, rows);
    case 'diff': return renderDiff(state, cols, rows);
    case 'rules': return renderRules(state, cols, rows);
    case 'help': return renderHelp(state, cols, rows);
    default: return frame('?', '', [], '', cols, rows);
  }
}

// ---------- 상태와 동작 ----------
export function applyFix(text, fx) {
  const arr = cps(text);
  arr.splice(fx.start, fx.end - fx.start, ...cps(fx.replacement));
  return arr.join('');
}

export function createState(cwd) {
  return {
    screen: 'home', prev: [], message: '', cwd, disabled: new Set(), recent: [],
    home: { index: 0 },
    browser: { dir: cwd, entries: listDir(cwd), index: 0, input: null, stats: {} },
    rules: { index: 0 },
    doc: null, scroll: 0,
  };
}

export function openDocument(state, file) {
  const path = resolve(file);
  if (!existsSync(path) || statSync(path).isDirectory()) { state.message = `파일이 없습니다: ${file}`; return false; }
  const original = readFileSync(path, 'utf8');
  state.doc = { path, name: relative(state.cwd, path) || basename(path), original: check(original).text, text: check(original).text, findings: [], index: 0, filter: 'all', ruleFilter: null, dirty: false, undo: [], density: 0 };
  recheck(state);
  state.recent = [state.doc.name, ...state.recent.filter((r) => r !== state.doc.name)].slice(0, 5);
  go(state, 'findings');
  return true;
}

export function recheck(state) {
  const r = check(state.doc.text, { disable: [...state.disabled] });
  state.doc.findings = r.findings;
  state.doc.density = r.summary.density;
  state.doc.index = Math.max(0, Math.min(state.doc.index, visibleFindings(state.doc).length - 1));
}

export function go(state, screen) {
  if (state.screen !== screen) state.prev.push(state.screen);
  state.screen = screen;
  state.scroll = 0;
}
export function back(state) {
  state.screen = state.prev.pop() ?? 'home';
  state.scroll = 0;
}

export function applyAll(state) {
  let n = 0;
  for (let round = 0; round < 3; round += 1) {
    const fixes = state.doc.findings.filter((f) => f.fix).sort((a, b) => b.fix.start - a.fix.start);
    let last = Infinity;
    const chosen = fixes.filter((f) => { if (f.fix.end <= last) { last = f.fix.start; return true; } return false; });
    if (!chosen.length) break;
    state.doc.undo.push(state.doc.text);
    for (const f of chosen) state.doc.text = applyFix(state.doc.text, f.fix);
    n += chosen.length;
    state.doc.dirty = state.doc.text !== state.doc.original;
    recheck(state);
  }
  return n;
}

export function scanDir(state) {
  const b = state.browser;
  for (const e of b.entries) {
    if (e.dir) continue;
    try {
      const r = check(readFileSync(join(b.dir, e.name), 'utf8'), { disable: [...state.disabled] });
      b.stats[e.name] = { chars: r.summary.chars, warnings: r.summary.warnings, density: r.summary.density };
    } catch { /* 읽기 실패는 건너뛴다 */ }
  }
}

// 키 처리. 순수 함수에 가깝게 두되 파일 읽기·쓰기는 여기서 한다. 반환값 'quit'이면 종료.
export function handleKey(state, str, key) {
  state.message = '';
  const name = key?.name;
  const move = (obj, field, delta, max) => { obj[field] = Math.max(0, Math.min(max, obj[field] + delta)); };
  if (key?.ctrl && name === 'c') return 'quit';

  if (state.screen === 'home') {
    if (name === 'down' || str === 'j') move(state.home, 'index', 1, HOME_MENU.length - 1);
    else if (name === 'up' || str === 'k') move(state.home, 'index', -1, HOME_MENU.length - 1);
    else if (name === 'return') {
      const item = HOME_MENU[state.home.index].key;
      if (item === 'open') { state.browser.dir = state.cwd; state.browser.entries = listDir(state.cwd); state.browser.index = 0; go(state, 'browser'); }
      else if (item === 'path') { state.browser.input = ''; go(state, 'browser'); }
      else if (item === 'rules') go(state, 'rules');
      else if (item === 'help') go(state, 'help');
      else if (item === 'quit') return 'quit';
    }
    else if (/^[1-5]$/.test(str ?? '') && state.recent[Number(str) - 1]) openDocument(state, join(state.cwd, state.recent[Number(str) - 1]));
    else if (str === '?') go(state, 'help');
    else if (str === 'q') return 'quit';
    return null;
  }

  if (state.screen === 'browser') {
    const b = state.browser;
    if (b.input !== null) {
      if (name === 'escape') b.input = null;
      else if (name === 'return') { const p = b.input.trim(); b.input = null; if (p) openDocument(state, resolve(b.dir, p)); }
      else if (name === 'backspace') b.input = cps(b.input).slice(0, -1).join('');
      else if (str && !key?.ctrl && str.length >= 1 && !/[\x00-\x1f]/.test(str)) b.input += str;
      return null;
    }
    if (name === 'down' || str === 'j') move(b, 'index', 1, b.entries.length - 1);
    else if (name === 'up' || str === 'k') move(b, 'index', -1, b.entries.length - 1);
    else if (name === 'pagedown') move(b, 'index', 10, b.entries.length - 1);
    else if (name === 'pageup') move(b, 'index', -10, b.entries.length - 1);
    else if (name === 'home') b.index = 0;
    else if (name === 'end') b.index = b.entries.length - 1;
    else if (name === 'backspace') { b.dir = dirname(b.dir); b.entries = listDir(b.dir); b.index = 0; b.stats = {}; }
    else if (name === 'return') {
      const e = b.entries[b.index];
      if (!e) return null;
      if (e.dir) { b.dir = e.up ? dirname(b.dir) : join(b.dir, e.name); b.entries = listDir(b.dir); b.index = 0; b.stats = {}; }
      else openDocument(state, join(b.dir, e.name));
    }
    else if (str === '/') b.input = '';
    else if (str === 'c') { scanDir(state); state.message = `${Object.keys(b.stats).length}개 파일을 검사했습니다.`; }
    else if (str === '?') go(state, 'help');
    else if (name === 'escape') back(state);
    else if (str === 'q') return 'quit';
    return null;
  }

  if (state.screen === 'findings') {
    const doc = state.doc;
    const visible = visibleFindings(doc);
    if (name === 'down' || str === 'j') move(doc, 'index', 1, visible.length - 1);
    else if (name === 'up' || str === 'k') move(doc, 'index', -1, visible.length - 1);
    else if (name === 'pagedown') move(doc, 'index', 10, visible.length - 1);
    else if (name === 'pageup') move(doc, 'index', -10, visible.length - 1);
    else if (name === 'home') doc.index = 0;
    else if (name === 'end') doc.index = Math.max(0, visible.length - 1);
    else if (str === 'a') {
      const f = visible[doc.index];
      if (!f?.fix) state.message = '이 발견에는 자동 수정이 없습니다. 문맥을 보고 직접 판단하세요.';
      else { doc.undo.push(doc.text); doc.text = applyFix(doc.text, f.fix); doc.dirty = doc.text !== doc.original; recheck(state); state.message = '수정을 적용했습니다. s 저장, u 되돌리기, d diff.'; }
    }
    else if (str === 'A') { const n = applyAll(state); state.message = n ? `${n}곳을 수정했습니다. d로 diff를 확인하고 s로 저장하세요.` : '적용할 수정이 없습니다.'; }
    else if (str === 'u') { if (doc.undo.length) { doc.text = doc.undo.pop(); doc.dirty = doc.text !== doc.original; recheck(state); state.message = '되돌렸습니다.'; } else state.message = '되돌릴 것이 없습니다.'; }
    else if (str === 's') { if (doc.dirty) { writeFileSync(doc.path, doc.text); doc.original = doc.text; doc.dirty = false; state.message = `${doc.name}에 저장했습니다.`; } else state.message = '변경 사항이 없습니다.'; }
    else if (str === 'd') go(state, 'diff');
    else if (str === 'w') { doc.filter = doc.filter === 'all' ? 'warning' : 'all'; doc.index = 0; }
    else if (str === 'f') {
      const ids = [null, ...RULES_KO.map((r) => r.id).filter((id) => doc.findings.some((x) => x.ruleId === id))];
      doc.ruleFilter = ids[(ids.indexOf(doc.ruleFilter) + 1) % ids.length];
      doc.index = 0;
    }
    else if (str === 'r') { recheck(state); state.message = '다시 검사했습니다.'; }
    else if (str === '?') go(state, 'help');
    else if (name === 'escape') { if (doc.dirty && !state.escArmed) { state.escArmed = true; state.message = '저장하지 않은 수정이 있습니다. 다시 Esc를 누르면 버리고 나갑니다. s는 저장.'; return null; } state.escArmed = false; back(state); }
    else if (str === 'q') { if (doc.dirty && !state.quitArmed) { state.quitArmed = true; state.message = '저장하지 않은 수정이 있습니다. 다시 q를 누르면 버리고 종료합니다. s는 저장.'; return null; } return 'quit'; }
    if (name !== 'escape') state.escArmed = false;
    if (str !== 'q') state.quitArmed = false;
    return null;
  }

  if (state.screen === 'diff') {
    if (name === 'down' || str === 'j') state.scroll += 1;
    else if (name === 'up' || str === 'k') state.scroll = Math.max(0, state.scroll - 1);
    else if (name === 'pagedown') state.scroll += 20;
    else if (name === 'pageup') state.scroll = Math.max(0, state.scroll - 20);
    else if (str === 's') { const doc = state.doc; if (doc.dirty) { writeFileSync(doc.path, doc.text); doc.original = doc.text; doc.dirty = false; state.message = `${doc.name}에 저장했습니다.`; } else state.message = '변경 사항이 없습니다.'; }
    else if (name === 'escape' || str === 'q') back(state);
    return null;
  }

  if (state.screen === 'rules') {
    if (name === 'down' || str === 'j') move(state.rules, 'index', 1, RULES_KO.length - 1);
    else if (name === 'up' || str === 'k') move(state.rules, 'index', -1, RULES_KO.length - 1);
    else if (name === 'space' || name === 'return') {
      const id = RULES_KO[state.rules.index].id;
      if (state.disabled.has(id)) state.disabled.delete(id); else state.disabled.add(id);
      if (state.doc) recheck(state);
      state.message = `${id} ${state.disabled.has(id) ? '꺼짐' : '켜짐'}. 이 세션에만 적용됩니다.`;
    }
    else if (name === 'escape' || str === 'q') back(state);
    return null;
  }

  if (state.screen === 'help') {
    if (name === 'escape' || str === 'q' || str === '?') back(state);
    return null;
  }
  return null;
}

// ---------- 실행 ----------
export function runTui(file, options = {}) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('TUI는 터미널에서만 실행할 수 있습니다.');
  const state = createState(process.cwd());
  if (options.disable) for (const id of options.disable) state.disabled.add(id);
  if (file) { if (!openDocument(state, file)) throw new Error(state.message); state.prev = ['home']; }

  const draw = () => {
    const cols = stdout.columns || 100;
    const rows = stdout.rows || 30;
    stdout.write(`${ESC}H${ESC}2J${render(state, cols, rows).join('\n')}`);
  };
  const exit = () => { stdin.setRawMode(false); stdout.write(`${ESC}?25h${ESC}?1049l`); process.exit(0); };

  stdout.write(`${ESC}?1049h${ESC}?25l`);
  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.on('resize', draw);
  stdin.on('keypress', (str, key) => {
    let result;
    try { result = handleKey(state, str, key); } catch (err) { state.message = `오류: ${err.message}`; }
    if (result === 'quit') exit();
    draw();
  });
  draw();
}
