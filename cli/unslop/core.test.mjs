import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, fix, diffLines } from './src/core.mjs';
import { splitSentences, lineCol, stem } from './src/text.mjs';

const ids = (text, opts) => check(text, opts).findings.map((f) => f.ruleId);

test('Taxonomy 정상 예시(Hard Negative)에는 warning이 없다', () => {
  const clean = [
    '다양한 파일 형식인 PDF, DOCX, TXT를 지원합니다. SSH 터널을 통해 서버에 접속합니다. 또한 옵션을 직접 지정할 수 있습니다.',
    '제출 기한은 금요일입니다. 이후 제출분은 다음 달에 심사합니다. 추가 검증에서 오류가 발견되면 배포가 늦어질 수 있습니다.',
    '신청서는 온라인으로 제출합니다. 접수 마감은 금요일입니다. CSV로 저장할 수 있습니다. 승인 후 열람할 수 있습니다.',
  ].join('\n\n');
  const r = check(clean);
  assert.equal(r.summary.warnings, 0, JSON.stringify(r.findings));
});

test('UNS008: 짧은 글의 예고 문장은 warning이고 삭제 수정을 제안한다', () => {
  const text = '아래에서 제출 기한에 대해 안내해 드리겠습니다. 제출 기한은 금요일입니다.';
  const r = check(text);
  const f = r.findings.find((x) => x.ruleId === 'UNS008');
  assert.equal(f.severity, 'warning');
  assert.equal(fix(text).text, '제출 기한은 금요일입니다.');
});

test('UNS002: 연속 문장의 같은 접속어는 두 번째부터 표시하고 제거한다', () => {
  const text = '또한 신청서는 온라인으로 제출합니다. 또한 접수 마감은 금요일입니다.';
  assert.deepEqual(ids(text, { only: ['UNS002'] }), ['UNS002']);
  assert.equal(fix(text, { fixRules: ['UNS002'] }).text, '또한 신청서는 온라인으로 제출합니다. 접수 마감은 금요일입니다.');
  // 한 번만 쓰인 접속어는 표시하지 않는다.
  assert.deepEqual(ids('신청서는 온라인으로 제출합니다. 또한 접수 마감은 금요일입니다.', { only: ['UNS002'] }), []);
});

test('UNS003과 UNS007: 반복되는 시작말과 끝말', () => {
  assert.ok(ids('또한 A입니다. 또한 B입니다. 또한 C입니다.').includes('UNS003'));
  assert.ok(ids('로그인을 할 수 있습니다. 결제를 할 수 있습니다. 검색을 할 수 있습니다. 공유를 할 수 있습니다.', { only: ['UNS007'] }).includes('UNS007'));
});

test('UNS004: 겹친 유보만 표시하고, 조건부 “수 있다”는 건드리지 않는다', () => {
  const text = '금요일에 배포할 수 있을 것으로 예상됩니다.';
  assert.deepEqual(ids(text, { only: ['UNS004'] }), ['UNS004']);
  assert.equal(fix(text).text, '금요일에 배포할 것으로 예상됩니다.');
  assert.deepEqual(ids('추가 검증에서 오류가 발견되면 배포가 늦어질 수 있습니다.', { only: ['UNS004'] }), []);
});

test('UNS005: 추상 명사 연쇄', () => {
  assert.deepEqual(ids('업무 효율성 극대화 방안 마련을 추진합니다.', { only: ['UNS005'] }), ['UNS005']);
  assert.deepEqual(ids('모바일 가입 오류 로그를 확인한 뒤 원인을 보고하겠습니다.', { only: ['UNS005'] }), []);
});

test('UNS006: 재진술을 표시하고 겹침이 크면 삭제를 제안한다', () => {
  const text = '제출 기한은 금요일입니다. 즉, 금요일까지 제출해야 한다는 뜻입니다.';
  const f = check(text, { only: ['UNS006'] }).findings[0];
  assert.equal(f.ruleId, 'UNS006');
  assert.deepEqual(f.related, { start: 0, end: 14 });
  // 새 조건을 더하는 문장은 재진술이 아니다.
  assert.deepEqual(ids('제출 기한은 금요일입니다. 이후 제출분은 다음 달에 심사합니다.', { only: ['UNS006'] }), []);
});

test('UNS001, UNS009, UNS010은 info이며 수정을 제안하지 않는다', () => {
  const r = check('이번 개편은 다양한 관점에서 원인을 분석합니다. 이는 매우 중요한 부분입니다. 개편은 개편의 개편을 개편합니다. 개편이 개편을 낳습니다.');
  for (const id of ['UNS001', 'UNS009', 'UNS010']) {
    const f = r.findings.find((x) => x.ruleId === id);
    assert.ok(f, `${id} 없음`);
    assert.equal(f.severity, 'info');
    assert.equal(f.fixable, false);
  }
});

test('코드 블록과 URL 안은 검사하지 않는다', () => {
  const text = '설치 방법입니다.\n\n```\n다양한 관점에서 보다 효율적인\n```\n\nhttps://example.com/다양한관점에서';
  assert.deepEqual(ids(text, { only: ['UNS001'] }), []);
});

test('fix는 멱등이며 수정 후 재검사에서 같은 수정이 다시 나오지 않는다', () => {
  const text = '아래에서 기한을 안내해 드리겠습니다. 기한은 금요일입니다. 또한 A입니다. 또한 B입니다.';
  const once = fix(text).text;
  assert.equal(fix(once).text, once);
  assert.equal(fix(once).applied.length, 0);
});

test('좌표와 유틸리티', () => {
  const text = '첫 줄.\n둘째 줄입니다.';
  const s = splitSentences(text);
  assert.equal(s[1].text, '둘째 줄입니다.');
  assert.deepEqual(lineCol(text, s[1].start), { line: 2, col: 1 });
  assert.equal(stem('서버에서'), '서버');
  assert.equal(diffLines('a\nb', 'a\nc'), '  a\n- b\n+ c');
});
