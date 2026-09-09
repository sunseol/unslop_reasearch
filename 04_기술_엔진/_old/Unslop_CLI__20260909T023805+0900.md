# Unslop CLI v0.1

한국어 문서에서 slop 단서를 찾아 보고하고, 의미를 보존할 수 있는 경우에만 제거하는 명령줄 도구다. 현재 결론은 사업계획서 11장의 구조대로 오프라인·결정적 린터를 먼저 만들고, LLM 기반 의미 분석은 뒤로 미루는 것이다. 사업계획서는 Core 개발을 Benchmark 완성 뒤에 두었지만, 추가 표본 수집 없이 개발을 진행한다는 2026-09-09 결정에 따라 지금 만들었다. 따라서 규칙의 정밀도·재현율은 아직 측정되지 않았다.

## 위치와 실행

코드는 `cli/unslop/`에 있다. Node 22 내장 모듈만 사용하며 저장소의 다른 코드에 의존하지 않는다. 나중에 별도 npm 패키지로 떼어 낼 수 있게 한 것이다.

```sh
npm run unslop -- check README.md
npm run unslop -- check README.md --format json
npm run unslop -- fix README.md            # diff만 출력
npm run unslop -- fix README.md --write    # 파일 수정
npm run unslop -- rules
```

`package.json`의 `bin`에 등록되어 있어 `npm link` 뒤에는 `unslop check`로 실행할 수 있다. 파일 대신 `-`를 주면 표준 입력을 읽는다. warning이 하나라도 있으면 종료 코드 1을 돌려 CI에서 쓸 수 있다.

## 설계 원칙

- **단서를 찾고 판정은 사람이 한다.** [Slop Taxonomy v0.2](../02_문체_품질_기준/Slop_Taxonomy.md)는 단어가 아니라 문맥과 기능으로 판정한다. 결정적 규칙은 문맥을 알지 못하므로, 문맥 없이도 방해가 분명한 경우(연속 반복 접속어, 짧은 글의 예고 문장, 겹친 유보, 재진술)만 `warning`으로, 나머지는 `info`로 낸다. 모든 메시지에 “정상일 수 있는 조건”을 함께 적는다.
- **AI 탐지기가 아니다.** 현재 말뭉치 380건에서 warning 밀도는 사람 문서 0.30, AI 문서 0.05~0.29(1,000자당)로 작성 주체와 무관하다. 규칙은 작성 주체를 추정하지 않는다.
- **수정은 의미와 발화 의도를 보존한다.** 자동 수정은 삭제해도 정보·조건·책임·불확실성이 바뀌지 않는 경우에만 제안한다. 조건·권한·기능을 나타내는 “할 수 있다”는 건드리지 않는다. 사실을 채워 넣는 수정은 하지 않는다.
- **코드와 URL은 건너뛴다.** 마크다운 코드 블록, 인라인 코드, URL 안은 검사하지 않는다.
- **좌표는 데이터 Schema와 같다.** 발견 구간은 코드 포인트 인덱스(start 포함, end 미포함)와 줄·열로 낸다. Challenge와 평가 데이터의 구간과 바로 대조할 수 있다.

## 규칙

사업계획서 11.2절의 초기 Rule 10개를 Taxonomy 유형에 대응시켰다. Rule ID와 Taxonomy 유형 ID는 별개이며 일대일 대응을 가정하지 않는다.

| Rule | 이름 | Taxonomy 유형 | 기본 severity | 자동 수정 | 무엇을 찾는가 |
|---|---|---|---|---|---|
| UNS001 | stock-phrase | empty-expression | info | 없음 | 상투 표현 목록(“다양한 관점에서”, “보다 효율적인” 등). 단어 하나(“다양한”)만으로는 표시하지 않는다. |
| UNS002 | excessive-transition | unnecessary-transition | warning | 두 번째부터 접속어 삭제 | 연속 문장이 같은 접속어로 시작. 1,000자당 8개 초과 밀도는 info로 한 번 알림 |
| UNS003 | repeated-opener | repetitive-structure | warning | 없음 | 문장 3개 이상이 같은 첫 어절로 시작 |
| UNS004 | excessive-hedging | excessive-hedging | warning | “수 있을 것으로 보입니다” → “것으로 보입니다”만 | 한 문장에 유보 표현 2개 이상 |
| UNS005 | abstract-noun-chain | vague-claim | info | 없음 | 추상 명사(…화/성/방안/역량 등) 3개 이상 연쇄 |
| UNS006 | redundant-summary | redundant-content | warning | 겹침 80% 이상 또는 “즉” 뒤 60% 이상이면 삭제 | 앞 문장과 2-gram 겹침 60% 이상, 또는 재진술 표지 뒤 어간 겹침 |
| UNS007 | repetitive-structure | repetitive-structure | info | 없음 | 문장 4개 이상이 같은 끝말 |
| UNS008 | excessive-signposting | excessive-signposting | 짧은 글 warning, 긴 글 info | 짧은 글(1,500자 미만)에서 삭제 | “아래에서 … 안내해 드리겠습니다” 같은 예고 문장 |
| UNS009 | filler-sentence | vague-claim | info | 없음 | 평가만 있는 문장(“이는 매우 중요한 부분입니다”) |
| UNS010 | repeated-vocabulary | empty-expression | info | 없음 | 문장 3개 안에 같은 어간 5회 이상. 주제어 반복은 정상 |

fake-contrast에 대응하는 규칙은 아직 없다. 대조의 근거 유무는 결정적 규칙으로 판정하기 어렵다.

## 출력

텍스트 형식은 사업계획서 12장의 예를 따르되 밀도 단위를 바꿨다. 한국어는 어절 수보다 글자 수가 안정적이어서 **1,000자당 warning 수**를 Slop density로 쓴다.

```text
README.md
3:22 warning (fixable)
  "또한"
  앞 문장과 같은 접속어 “또한”로 시작합니다. 연속 반복은 문장 관계를 표시하지 못합니다.
  UNS002 excessive-transition → unnecessary-transition

2 problems, 1 notes
Slop density: 7.8 / 1k chars
```

JSON 형식은 `findings[]`에 `ruleId`, `name`, `taxonomy`, `severity`, `start`, `end`, `line`, `col`, `quote`, `message`, `fixable`, `fix`, `related`를 담는다.

## 자동 수정 절차

`fix`는 fixable 발견 중 서로 겹치지 않는 것을 뒤에서부터 적용하고, 다시 검사해 새 수정이 없을 때까지 최대 3회 반복한다. 기본은 diff만 보여 주고 `--write`를 줄 때만 파일을 바꾼다. `--rules`로 적용할 규칙을 제한할 수 있다. 수정 결과에 다시 `fix`를 적용해도 바뀌지 않는다(멱등).

## 확인한 것

- Taxonomy의 문제 예시를 모은 글에서 규칙 7개가 발화하고 밀도 27.2, 정상 예시(Hard Negative 포함)를 모은 글에서는 warning 0건이다.
- 말뭉치 380건에서 규칙별 발화는 UNS010이 압도적으로 많고(info), UNS006·UNS003·UNS007이 그 뒤다. UNS004·UNS001은 드물다. 상투 표현 목록이 짧아서다.
- 테스트 11개가 각 규칙의 문제·정상 사례와 수정 멱등성을 검사한다.

## 근거

[사업계획서](../unslop_business_plan.md) 11장 Core 구조와 초기 Rule, 12장 CLI 출력 예, [Slop Taxonomy v0.2](../02_문체_품질_기준/Slop_Taxonomy.md)의 판정 원칙과 유형 정의, 사업계획서 후보와의 대응표를 따랐다. severity 구분, 자동 수정 범위, 밀도 단위는 이 문서의 제안이다.

## 미결 사항

- **정밀도 측정.** Taxonomy 시험의 Gold가 나오면 규칙 발견과 평가자 판정의 일치율을 측정한다. 그 전까지 warning은 “확인할 것”이지 판정이 아니다.
- **상투 표현 목록.** 현재 24개다. Challenge에서 많이 선택된 문장과 평가자 판정에서 목록을 늘린다. 금칙어 목록이 되지 않도록 단어 하나짜리 항목은 넣지 않는다.
- **LLM 플러그인.** 의미 기반 재진술·공허한 주장 판정은 선택 플러그인으로 두기로 했으나 인터페이스를 정하지 않았다.
- **영어 규칙.** 다루지 않는다.
- **패키지 분리와 공개.** 사업계획서 9단계(Open Source 배포) 시점에 `cli/unslop/`을 별도 패키지로 뗀다. 라이선스는 정하지 않았다.
