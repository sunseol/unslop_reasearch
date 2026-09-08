import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, makeSpan, verifySpan, spanJaccard, utf16IndexToCodePoint, spansOverlap } from './text.mjs';

test('normalizeText: CRLF, 줄 끝 공백, 연속 빈 줄, NFC', () => {
  const raw = '첫 문단  \r\n\r\n\r\n둘째 문단\t\r\n';
  assert.equal(normalizeText(raw), '첫 문단\n\n둘째 문단');
  const nfd = '한'.normalize('NFD');
  assert.equal(normalizeText(nfd), '한');
});

test('makeSpan: 코드 포인트 좌표와 인용문, 문단 번호', () => {
  const text = '기한은 금요일입니다.\n\n혁신적이고 획기적인 기능입니다.';
  const start = Array.from('기한은 금요일입니다.\n\n').length;
  const span = makeSpan(text, start, start + 10);
  assert.equal(span.quote, '혁신적이고 획기적인');
  assert.equal(span.paragraph, 1);
  assert.ok(verifySpan(text, span));
  assert.ok(!verifySpan(text, { ...span, quote: '다른 글' }));
});

test('utf16IndexToCodePoint: 서로게이트 쌍이 있어도 코드 포인트로 센다', () => {
  const text = '😀가나';
  assert.equal(utf16IndexToCodePoint(text, 2), 1);
  assert.equal(utf16IndexToCodePoint(text, 3), 2);
});

test('spanJaccard와 spansOverlap', () => {
  const a = { start: 0, end: 10 };
  const b = { start: 5, end: 15 };
  assert.equal(spanJaccard(a, b), 5 / 15);
  assert.ok(spansOverlap(a, b));
  assert.equal(spanJaccard(a, { start: 10, end: 12 }), 0);
  assert.ok(!spansOverlap(a, { start: 10, end: 12 }));
});
