#!/usr/bin/env node
// unslop CLI. 사용법:
//   unslop check <file...> [--format text|json] [--only UNS002,UNS006] [--disable UNS010]
//   unslop fix <file...> [--write] [--rules UNS002,UNS006,UNS008]   (기본은 diff만 출력)
//   unslop rules
// 파일 대신 - 를 주면 stdin을 읽는다. 종료 코드: warning이 하나라도 있으면 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { check, fix, formatText, formatJson, diffLines, VERSION } from '../src/core.mjs';
import { RULES_KO } from '../src/rules-ko.mjs';

function parse(argv) {
  const [command, ...rest] = argv;
  const opts = { files: [], format: 'text', write: false };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--format') opts.format = rest[++i];
    else if (a === '--only') opts.only = rest[++i].split(',');
    else if (a === '--disable') opts.disable = rest[++i].split(',');
    else if (a === '--rules') opts.fixRules = rest[++i].split(',');
    else if (a === '--write') opts.write = true;
    else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    else opts.files.push(a);
  }
  return { command, opts };
}

function readInput(file) {
  return file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
}

function usage() {
  console.log(`unslop ${VERSION}
사용법:
  unslop check <file...> [--format text|json] [--only IDs] [--disable IDs]
  unslop fix <file...> [--write] [--rules IDs]
  unslop                                 대화형 화면(TUI) 시작
  unslop tui [file]                      대화형 화면에서 파일을 바로 엽니다
  unslop rules
파일 대신 - 를 주면 표준 입력을 읽습니다.`);
}

function main() {
  const argv = process.argv.slice(2);
  // 인자 없이 터미널에서 실행하면 TUI 홈으로 들어간다. 파이프 환경에서는 사용법을 보여 준다.
  if (!argv.length && process.stdin.isTTY && process.stdout.isTTY) {
    return import('../src/tui.mjs').then(({ runTui }) => runTui(null, {})).catch((err) => { console.error(err.message); process.exitCode = 2; });
  }
  const { command, opts } = parse(argv);
  if (!command || command === '--help' || command === '-h') return usage();
  if (command === '--version' || command === '-v') return console.log(VERSION);
  if (command === 'rules') {
    for (const r of RULES_KO) console.log(`${r.id}  ${r.name.padEnd(22)} → ${r.taxonomy.padEnd(24)} ${r.severity}${r.fixable ? '  fixable' : ''}`);
    return;
  }
  if (command === 'tui') {
    if (opts.files.length > 1 || opts.files[0] === '-') { console.error('사용법: unslop tui [file]'); process.exitCode = 2; return; }
    return import('../src/tui.mjs').then(({ runTui }) => runTui(opts.files[0] ?? null, opts)).catch((err) => { console.error(err.message); process.exitCode = 2; });
  }
  if (!['check', 'fix'].includes(command)) { usage(); process.exitCode = 2; return; }
  if (!opts.files.length) { usage(); process.exitCode = 2; return; }

  let warnings = 0;
  const jsonOut = [];
  for (const file of opts.files) {
    const input = readInput(file);
    if (command === 'check') {
      const result = check(input, opts);
      warnings += result.summary.warnings;
      if (opts.format === 'json') jsonOut.push(JSON.parse(formatJson(file, result)));
      else console.log(`${formatText(file, result)}\n`);
    } else {
      const { text, applied } = fix(input, opts);
      if (opts.write && file !== '-') {
        writeFileSync(file, text);
        console.log(`${file}: ${applied.length}곳 수정`);
      } else if (opts.format === 'json') {
        jsonOut.push({ file, applied, text });
      } else {
        console.log(`${file}: ${applied.length}곳 수정 제안${applied.length ? '' : ' 없음'}`);
        if (applied.length) console.log(diffLines(input.replace(/\r\n?/g, '\n'), text));
        console.log('');
      }
    }
  }
  if (opts.format === 'json') console.log(JSON.stringify(jsonOut.length === 1 ? jsonOut[0] : jsonOut, null, 2));
  if (command === 'check' && warnings > 0) process.exitCode = 1;
}

try { main(); } catch (err) { console.error(err.message); process.exitCode = 2; }
