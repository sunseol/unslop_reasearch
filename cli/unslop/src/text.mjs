// 텍스트 처리. CLI는 저장소의 다른 코드에 의존하지 않도록 필요한 함수를 자체로 가진다.
// 좌표는 데이터 Schema와 같은 유니코드 코드 포인트 인덱스(start 포함, end 미포함)다.

export function normalizeText(text) {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export const cps = (text) => Array.from(text);

// 문장 분리. 줄바꿈은 항상 경계다. 한 줄 안에서는 . ! ? 。 뒤에 공백이 오면 경계다.
// 마침표 뒤에 숫자·영문이 바로 이어지면(버전, 소수, URL) 경계가 아니다.
export function splitSentences(text) {
  const c = cps(text);
  const out = [];
  let start = 0;
  let paragraph = 0;
  let paragraphStart = true;
  const push = (end) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(c[s])) s += 1;
    while (e > s && /\s/.test(c[e - 1])) e -= 1;
    if (e > s) {
      out.push({ start: s, end: e, text: c.slice(s, e).join(''), paragraph, paragraphStart });
      paragraphStart = false;
    }
    start = end;
  };
  for (let i = 0; i < c.length; i += 1) {
    const ch = c[i];
    if (ch === '\n') {
      push(i);
      start = i + 1;
      if (c[i + 1] === '\n') { paragraph += 1; paragraphStart = true; }
      continue;
    }
    if ('.!?。'.includes(ch)) {
      const next = c[i + 1];
      if ((next === undefined || next === ' ' || next === '\n') && !(ch === '.' && /[0-9A-Za-z]/.test(next ?? ''))) push(i + 1);
    }
  }
  push(c.length);
  return out;
}

// 코드 포인트 인덱스를 1부터 세는 줄·열로 바꾼다.
export function lineCol(text, index) {
  const before = cps(text).slice(0, index);
  let line = 1;
  let col = 1;
  for (const ch of before) { if (ch === '\n') { line += 1; col = 1; } else col += 1; }
  return { line, col };
}

// 마크다운 코드 블록·인라인 코드·URL 구간. 규칙은 이 구간을 건너뛴다.
export function protectedRanges(text) {
  const ranges = [];
  const s = text;
  const add = (re) => {
    for (const m of s.matchAll(re)) ranges.push([cps(s.slice(0, m.index)).length, cps(s.slice(0, m.index + m[0].length)).length]);
  };
  add(/```[\s\S]*?```/g);
  add(/`[^`\n]*`/g);
  add(/https?:\/\/\S+/g);
  return ranges;
}

export const inRanges = (ranges, start, end) => ranges.some(([a, b]) => start < b && end > a);

// 어절 단위 토큰(공백 기준). 문장 부호를 떼고 2자 이상만 남긴다.
export function words(sentence) {
  return sentence
    .split(/\s+/)
    .map((w) => w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ''))
    .filter((w) => cps(w).length >= 2);
}

// 조사·어미를 대략 떼어 어간을 얻는다. 반복 어휘 비교용이며 형태소 분석이 아니다.
export function stem(word) {
  return word.replace(/(으로써|으로서|에서는|에게는|이라는|라는|에서|에게|으로|로써|로서|까지|부터|처럼|보다|이나|이며|이고|하고|과|와|은|는|이|가|을|를|의|에|도|로|만)$/u, '');
}
