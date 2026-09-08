import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitTopLevel, parseLength, parseReaderPurpose, parsePromptBank, validateTasks } from './build-tasks.mjs';

test('splitTopLevel: 괄호 안 쉼표는 나누지 않는다', () => {
  assert.deepEqual(splitTopLevel('기능 A 완료, 기능 B 테스트 중(버그 3건, 2건 수정), 배포 예정'), [
    '기능 A 완료',
    '기능 B 테스트 중(버그 3건, 2건 수정)',
    '배포 예정',
  ]);
});

test('parseLength: 천 단위 쉼표를 처리한다', () => {
  assert.deepEqual(parseLength('600~1,000'), { min: 600, max: 1000, unit: 'chars' });
});

test('parseReaderPurpose: 첫 문장은 독자, 나머지는 목적', () => {
  assert.deepEqual(parseReaderPurpose('팀장. 진행 상황 확인'), { reader: '팀장', purpose: '진행 상황 확인' });
});

test('parsePromptBank: 소형 표를 읽는다', () => {
  const md = [
    '### 업무보고 (report, 1개)',
    '| ID | 과제 | 독자와 목적 | 제공 사실 | 분량 |',
    '|---|---|---|---|---|',
    '| task-001 | 주간 보고 | 팀장. 확인 | A 완료, B 진행 | 300~600 |',
  ].join('\n');
  const [t] = parsePromptBank(md);
  assert.equal(t.domain, 'report');
  assert.deepEqual(t.facts, ['A 완료', 'B 진행']);
  assert.match(t.brief, /상황: 주간 보고/);
  assert.match(t.brief, /- A 완료/);
});

test('실제 Prompt Bank는 60개 과제와 영역 배분을 만족한다', () => {
  const tasks = parsePromptBank(readFileSync('03_데이터와_평가/Prompt_Bank.md', 'utf8'));
  assert.deepEqual(validateTasks(tasks), []);
});
