// unslop core: check(text) → findings, fix(text) → 수정된 텍스트. 오프라인·결정적.
import { normalizeText, cps, splitSentences, lineCol, protectedRanges } from './text.mjs';
import { RULES_KO } from './rules-ko.mjs';

export const VERSION = '0.1.0';

export function check(rawText, options = {}) {
  const text = normalizeText(rawText);
  const rules = (options.rules ?? RULES_KO).filter((r) => !options.disable?.includes(r.id)).filter((r) => !options.only || options.only.includes(r.id));
  const ctx = { text, cps: cps(text), sentences: splitSentences(text), protectedRanges: protectedRanges(text), options };
  const findings = [];
  for (const rule of rules) {
    for (const f of rule.run(ctx)) {
      const { line, col } = lineCol(text, f.start);
      findings.push({ ...f, line, col, quote: ctx.cps.slice(f.start, f.end).join('').slice(0, 80), fixable: Boolean(f.fix) });
    }
  }
  findings.sort((a, b) => a.start - b.start || a.ruleId.localeCompare(b.ruleId));
  const chars = ctx.cps.length;
  const problems = findings.filter((f) => f.severity === 'warning').length;
  return {
    text,
    findings,
    summary: {
      chars,
      sentences: ctx.sentences.length,
      warnings: problems,
      infos: findings.length - problems,
      // 한국어는 어절 수보다 글자 수가 안정적이어서 1,000자당 warning 수를 밀도로 쓴다.
      density: chars ? Math.round((problems / chars) * 1000 * 10) / 10 : 0,
    },
  };
}

// 자동 수정. fixable 발견 중 겹치지 않는 것을 뒤에서부터 적용한다. 수정 뒤 다시 검사해 새 수정이 없을 때까지 최대 3회 반복한다.
export function fix(rawText, options = {}) {
  let text = normalizeText(rawText);
  const applied = [];
  for (let round = 0; round < 3; round += 1) {
    const { findings } = check(text, options);
    const fixes = findings.filter((f) => f.fix && (!options.fixRules || options.fixRules.includes(f.ruleId))).map((f) => ({ ...f.fix, ruleId: f.ruleId })).sort((a, b) => b.start - a.start);
    const chosen = [];
    let lastStart = Infinity;
    for (const fx of fixes) { if (fx.end <= lastStart) { chosen.push(fx); lastStart = fx.start; } }
    if (!chosen.length) break;
    const arr = cps(text);
    for (const fx of chosen) arr.splice(fx.start, fx.end - fx.start, ...cps(fx.replacement));
    text = normalizeText(arr.join('')).replace(/^\s+$/gm, '');
    applied.push(...chosen);
  }
  return { text, applied };
}

export function formatText(file, result) {
  const lines = [file];
  for (const f of result.findings) {
    lines.push(`${f.line}:${f.col} ${f.severity}${f.fixable ? ' (fixable)' : ''}`);
    if (f.quote) lines.push(`  "${f.quote.replace(/\n/g, ' ')}"`);
    lines.push(`  ${f.message}`);
    lines.push(`  ${f.ruleId} ${f.name} → ${f.taxonomy}`);
  }
  lines.push('');
  lines.push(`${result.summary.warnings} problems, ${result.summary.infos} notes`);
  lines.push(`Slop density: ${result.summary.density} / 1k chars`);
  return lines.join('\n');
}

export function formatJson(file, result) {
  return JSON.stringify({ file, version: VERSION, summary: result.summary, findings: result.findings.map(({ fix: fx, ...f }) => ({ ...f, fix: fx ?? null })) }, null, 2);
}

// 줄 단위 diff. 외부 라이브러리 없이 LCS로 만든다.
export function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push(`  ${a[i]}`); i += 1; j += 1; }
    else if (i < a.length && (j >= b.length || dp[i + 1][j] >= dp[i][j + 1])) { out.push(`- ${a[i]}`); i += 1; }
    else { out.push(`+ ${b[j]}`); j += 1; }
  }
  return out.filter((l, idx, arr) => !l.startsWith('  ') || arr.slice(Math.max(0, idx - 2), idx + 3).some((x) => !x.startsWith('  '))).join('\n');
}
