import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from './sentences.mjs';

test('splitSentences: 마침표+공백과 줄바꿈을 경계로 나누고 좌표가 원문과 맞는다', () => {
  const text = '기한은 금요일입니다. 이후 제출분은 다음 달에 심사합니다.\n\n버전 2.3.0을 설치하세요.\n- 항목 하나';
  const s = splitSentences(text);
  assert.deepEqual(s.map((x) => x.text), ['기한은 금요일입니다.', '이후 제출분은 다음 달에 심사합니다.', '버전 2.3.0을 설치하세요.', '- 항목 하나']);
  const cps = Array.from(text);
  for (const x of s) assert.equal(cps.slice(x.start, x.end).join(''), x.text);
  assert.deepEqual(s.map((x) => x.paragraph), [0, 0, 1, 1]);
  assert.deepEqual(s.map((x) => x.newParagraph), [true, false, true, false]);
});

test('splitSentences: 이모지 등 서로게이트 쌍이 있어도 코드 포인트로 센다', () => {
  const text = '😀 시작. 끝!';
  const s = splitSentences(text);
  assert.equal(s[0].text, '😀 시작.');
  assert.equal(s[1].start, 6);
});
