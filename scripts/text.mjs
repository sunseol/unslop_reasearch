// 데이터 Schema(03_데이터와_평가/데이터_Schema.md)의 본문 정규화와 구간 좌표 규칙 구현.
// 좌표는 정규화된 본문의 유니코드 코드 포인트 인덱스다(start 포함, end 미포함).

export function normalizeText(text) {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

export function toCodePoints(text) {
  return Array.from(text);
}

export function sliceCodePoints(text, start, end) {
  return toCodePoints(text).slice(start, end).join('');
}

// UTF-16 인덱스(자바스크립트 문자열 인덱스)를 코드 포인트 인덱스로 바꾼다.
export function utf16IndexToCodePoint(text, utf16Index) {
  return toCodePoints(text.slice(0, utf16Index)).length;
}

export function paragraphIndexAt(text, codePointIndex) {
  const before = sliceCodePoints(text, 0, codePointIndex);
  return before.split('\n\n').length - 1;
}

export function makeSpan(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    throw new Error(`잘못된 구간 좌표: ${start}..${end}`);
  }
  const quote = sliceCodePoints(text, start, end);
  if (toCodePoints(quote).length !== end - start) {
    throw new Error(`구간이 본문 길이를 넘는다: ${start}..${end}`);
  }
  return { start, end, quote, paragraph: paragraphIndexAt(text, start) };
}

export function verifySpan(text, span) {
  return sliceCodePoints(text, span.start, span.end) === span.quote;
}

// 두 구간의 코드 포인트 집합 Jaccard 유사도. 겹치지 않으면 0.
export function spanJaccard(a, b) {
  const interStart = Math.max(a.start, b.start);
  const interEnd = Math.min(a.end, b.end);
  const inter = Math.max(0, interEnd - interStart);
  const union = (a.end - a.start) + (b.end - b.start) - inter;
  return union === 0 ? 0 : inter / union;
}

export function spansOverlap(a, b) {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}
