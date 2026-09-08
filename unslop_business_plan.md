# Unslop 사업계획서

> **AI 시대의 문체 품질 표준을 만들고, 이를 기반으로 오픈소스 문서 품질 엔진과 상용 AI 문서 제품으로 확장한다.**

---

# 1. 사업 개요

## 1.1 사업명

**Unslop**

## 1.2 한 줄 정의

> **Unslop은 AI가 쓴 글을 판별하는 도구가 아니라, AI 시대에 반복적으로 증폭된 장황함·추상성·공허한 표현·반복 구조를 찾아내고 제거하는 문체 품질 엔진이다.**

## 1.3 사업의 출발점

최근 생성형 AI를 활용해 문서를 작성하는 사람이 빠르게 늘어나면서, 글을 “쓰는 비용”은 낮아졌지만 “읽고 이해하는 비용”은 오히려 커지는 문제가 발생하고 있다.

AI가 생성한 텍스트에는 다음과 같은 특징이 반복적으로 나타난다.

- 지나치게 장황한 설명
- 구체성이 부족한 추상적 표현
- 반복되는 연결어와 문장 구조
- 의미 없는 수식어
- 과도한 요약과 재진술
- 번역체처럼 느껴지는 어색한 문장
- 실제 행동이나 결론이 불명확한 표현

이 문제는 단순히 “AI 티가 난다”는 미관상의 문제가 아니다.

업무 문서, 보고서, 이메일, 기획서, 마케팅 문구 등에서 이러한 표현이 반복되면 읽는 사람은 핵심을 파악하기 위해 더 많은 인지적 비용을 지불해야 한다.

Unslop은 이 문제를 **측정 가능하고, 검증 가능하며, 자동화 가능한 품질 문제**로 정의하고자 한다.

---

# 2. 문제 정의

## 2.1 현재 시장의 문제

기존 AI 글쓰기 서비스는 대부분 다음 문제에 집중한다.

```text
빈 화면
  ↓
AI 초안 생성
  ↓
문서 완성
```

하지만 실제 사용자는 AI가 만든 초안을 그대로 사용하지 않는다.

대부분 다음 과정을 다시 거친다.

```text
AI 초안 생성
      ↓
장황한 표현 삭제
      ↓
애매한 문장 수정
      ↓
AI 특유 문체 제거
      ↓
문서 구조 재정리
      ↓
최종 제출
```

즉 AI는 작성 시간을 줄였지만, 새로운 형태의 **후처리 비용**을 발생시키고 있다.

---

## 2.2 기존 해결 방식의 한계

현재 사용자가 가장 쉽게 사용할 수 있는 방법은 다음과 같다.

> “이 글을 자연스럽게 고쳐줘.”

> “AI 티를 제거해줘.”

> “사람이 쓴 것처럼 바꿔줘.”

하지만 이런 방식에는 문제가 있다.

### 1. 결과가 재현되지 않는다
같은 문장도 모델과 프롬프트에 따라 결과가 달라진다.

### 2. 수정 이유를 알 수 없다
어떤 부분이 왜 문제였는지 설명하기 어렵다.

### 3. 의미 손실이 발생할 수 있다
문장을 단순화하면서 숫자, 조건, 맥락이 사라질 수 있다.

### 4. 정상적인 인간 글도 과도하게 수정한다
좋은 문장까지 불필요하게 바꿀 수 있다.

### 5. 객관적 품질 지표가 없다
“좀 더 자연스럽다”는 주관적 판단만 남는다.

---

# 3. 핵심 가설

Unslop 사업은 다음 가설에서 출발한다.

> **AI가 생성하거나 AI의 영향을 받은 텍스트에는 반복적으로 나타나는 품질 저하 패턴이 있으며, 이러한 패턴은 데이터와 인간 평가를 통해 객관적으로 정의하고 탐지할 수 있다.**

그리고 두 번째 가설은 다음과 같다.

> **이 문제를 정확하게 탐지하고 수정하는 오픈소스 엔진을 제공하면, 문서 품질에 민감한 사용자와 조직이 초기 사용자 및 잠재 고객으로 유입될 것이다.**

---

# 4. 사업 전략

Unslop은 처음부터 완성형 AI 문서 에디터를 만들지 않는다.

초기 사업 순서는 다음과 같다.

```text
STEP 1
문제 정의
↓
STEP 2
Unslop Challenge
↓
STEP 3
데이터 수집
↓
STEP 4
Unslop Benchmark
↓
STEP 5
Unslop Core
↓
STEP 6
Open Source 배포
↓
STEP 7
사용자 행동 수집
↓
STEP 8
유료 제품 검증
↓
STEP 9
AI 문서 에디터 / 조직용 제품 확장
```

핵심은 **제품보다 평가 기준을 먼저 만든다**는 것이다.

---

# 5. 1단계 — Slop Taxonomy 정의

가장 먼저 “AI Slop이 무엇인지”를 구체적으로 정의한다.

## 5.1 Vocabulary Level

- generic_phrase
- corporate_jargon
- empty_adjective
- weasel_word
- excessive_hedging

## 5.2 Sentence Level

- empty_claim
- abstract_claim
- redundant_sentence
- unnecessary_transition
- meta_commentary

## 5.3 Structure Level

- repetitive_sentence_structure
- excessive_triplet
- repetitive_conclusion
- heading_overuse
- excessive_signposting

## 5.4 LLM-specific Pattern

- stock_opener
- stock_closer
- fake_contrast
- summary_restatement
- repetitive transition

## 5.5 Korean-specific Pattern

예시:

```text
이를 통해
이러한
뿐만 아니라
나아가
전반적으로
효율적인
다양한
혁신적인
중요한 역할을 합니다
~할 수 있습니다
~하는 데 도움이 됩니다
```

중요한 원칙:

> 특정 단어를 금지하는 것이 아니라 **반복 빈도, 문맥, 문서 전체 구조를 함께 본다.**

---

# 6. 2단계 — Unslop Challenge 개발

## 6.1 목적

Unslop Challenge는 단순 홍보 이벤트가 아니다.

다음 세 가지 목적을 동시에 달성한다.

1. Benchmark용 데이터 수집
2. 잠재 사용자 확보
3. Unslop 브랜드 초기 확산

---

## 6.2 사용자 경험

메인 메시지:

> **AI 시대, 당신은 AI가 쓴 글을 구별할 수 있습니까?**

또는

> **Can You Spot the Slop?**

사용자에게 동일한 주제의 두 글을 보여준다.

```text
A                           B

신규 가입률이               최근 신규 가입률이
12% 감소했습니다.           감소하는 추세를 보이고 있습니다.

모바일 가입 오류와          이러한 상황을 개선하기 위해
광고 유입 품질을            다양한 관점에서 원인을 분석하고
우선 확인하겠습니다.        보다 효율적인 개선 방향을
                            모색할 필요가 있습니다.
```

---

## 6.3 질문 순서

반드시 다음 순서를 따른다.

```text
1. AI / Human 추측
↓
2. Confidence
↓
3. 어느 글이 더 좋은가
↓
4. AI스럽거나 불필요하다고 느낀 부분 선택
↓
5. 문제 이유 선택
↓
6. 정답 공개
```

이 순서를 지키는 이유는 정답을 먼저 공개했을 때 발생하는 판단 편향을 줄이기 위해서다.

---

## 6.4 수집 데이터

Challenge에서 다음 데이터를 수집한다.

### Source Classification

```text
Human
AI
```

### Confidence

```text
찍었다
약간 확신
꽤 확신
확실하다
```

### Preference

```text
A가 낫다
B가 낫다
비슷하다
```

### Span Annotation

사용자가 AI스럽거나 불필요하다고 느낀 부분을 직접 선택한다.

### Category

```text
장황하다
추상적이다
뻔한 표현이다
반복적이다
과하게 설명한다
번역체 같다
문장 구조가 AI스럽다
기타
```

---

# 7. 3단계 — Benchmark용 원천 데이터 구축

Challenge를 만들기 전에 비교용 Raw Corpus를 구축한다.

## 7.1 Prompt Bank

초기 목표:

**60개 Writing Task**

영역:

| 영역 | Task 수 |
|---|---:|
| 업무보고 / 기획 | 15 |
| 이메일 / 업무 커뮤니케이션 | 10 |
| 제품 / 마케팅 | 10 |
| 블로그 / 설명문 | 10 |
| 기술 문서 | 5 |
| 자기소개 / 일반 문서 | 5 |
| 자유형 | 5 |

---

## 7.2 Human Writing 데이터

초기:

- 작성자 10명
- 1인당 6개 Task
- 총 60개 문서

작성자 구성은 다양하게 한다.

```text
PM / 기획자
개발자
마케터
사무직
취준생
대학생
일반 직장인
```

전문 작가만 모집하지 않는다.

목표는 “가장 잘 쓴 인간 글”이 아니라 **현실적인 인간 문서 분포**를 만드는 것이다.

---

## 7.3 LLM Writing 데이터

동일한 60개 Task를 여러 모델에 입력한다.

예:

```text
Model Family A
Model Family B
Model Family C
Open-weight Model
```

초기 4개 모델이면:

```text
60 Task × 4 Model
= 240개 AI 문서
```

중요:

> “AI처럼 장황하게 써라”와 같은 인위적 프롬프트를 사용하지 않는다.

인간에게 주는 것과 동일한 Writing Brief를 제공한다.

---

## 7.4 Wild Human Corpus

통제 데이터 외에 실제 인간이 작성한 문서를 보강한다.

초기 목표:

**100개**

예:

- 공개 매뉴얼
- 공개 보고서
- README
- 기술 문서
- 공지
- 설명문
- 보도자료

조건:

> 공개 benchmark에 재배포 가능한 라이선스만 사용한다.

---

## 7.5 Hard Negative

초기 목표:

**50개**

예:

```text
SSH 터널을 통해 서버에 접속합니다.

다양한 파일 형식을 지원합니다.

또한 옵션을 직접 지정할 수 있습니다.
```

이 문장들은 AI가 자주 사용하는 표현을 포함하지만 문맥상 정상이다.

Hard Negative는 Unslop이 단순 금칙어 필터가 되는 것을 막는다.

---

## 7.6 초기 Raw Corpus 규모

```text
Human Controlled       60
AI Controlled         240
Wild Human            100
Hard Negative          50
────────────────────────
Total                 450 documents
```

---

# 8. 4단계 — Crowd Annotation

Challenge를 통해 대규모 weak annotation을 수집한다.

예:

```text
1,000명 참여
×
1인당 10개 판단
=
10,000 judgments
```

중요:

> 이 10,000개를 곧바로 Gold Label로 사용하지 않는다.

Crowd 데이터는 **후보 데이터를 좁히는 필터**로 사용한다.

---

# 9. 5단계 — Gold Benchmark 제작

## 9.1 평가자 구성

초기 비용을 줄이기 위해:

```text
Annotator A ──┐
              ├─ 동일 sample 평가
Annotator B ──┘
       │
       ├─ 일치 → Gold
       │
       └─ 불일치
              ↓
         3차 검토
```

즉:

- 2명 독립 평가
- 불일치 사례만 3차 판정

---

## 9.2 중요한 원칙

다음 두 개를 분리한다.

```text
source.type
```

과

```text
slop.label
```

즉:

```text
AI-generated + Clean
Human-written + Slop
```

모두 가능하다.

Unslop은 AI Detector가 아니다.

---

## 9.3 핵심 4분면

```text
                 실제 작성자

                Human     AI
              ┌────────┬────────┐
자연스럽다     │   A    │   B    │
              │        │        │
              ├────────┼────────┤
Slop스럽다    │   C    │   D    │
              │        │        │
              └────────┴────────┘
```

일반 AI Detector:

```text
A + C = Human
B + D = AI
```

Unslop:

```text
A + B = Clean
C + D = Slop
```

이 차이가 프로젝트의 핵심 철학이다.

---

# 10. 6단계 — Benchmark 지표 설계

Unslop은 단일 점수로 평가하지 않는다.

다음 네 가지를 별도로 본다.

## 10.1 Detection

실제 slop을 제대로 탐지하는가?

지표:

- Precision
- Recall
- F1

초기 목표:

```text
Precision ≥ 90%
Recall ≥ 60%
```

---

## 10.2 False Positive

정상적인 인간 문장을 잘못 잡는가?

초기 목표:

```text
Human false-positive rate ≤ 5%
Hard-negative false-positive rate ≤ 10%
```

초기에는 Recall보다 Precision을 더 중요하게 본다.

---

## 10.3 Meaning Preservation

수정 후 원래 의미가 유지되는가?

평가:

```text
5 완전히 보존
4 거의 보존
3 일부 손실
2 큰 손실
1 의미 변경
```

초기 목표:

```text
평균 ≥ 4.5 / 5
심각한 의미 변화 < 2%
```

---

## 10.4 Human Preference

사용자가 실제로 수정본을 더 선호하는가?

Blind A/B:

```text
Original
vs
Unslop
```

그리고:

```text
Generic GPT Rewrite
vs
Unslop
```

초기 목표:

> Unslop 결과가 Generic GPT Rewrite보다 높은 인간 선호도를 얻는 것

---

# 11. 7단계 — Unslop Core 개발

Benchmark가 일정 수준 완성된 뒤 Core 개발을 시작한다.

## 11.1 기본 철학

```text
unslop.check(text)
```

를 가장 먼저 만든다.

출력:

```json
[
  {
    "ruleId": "ko.abstract-claim",
    "start": 13,
    "end": 37,
    "severity": "warning",
    "category": "vagueness",
    "message": "구체적인 행위자와 행동 없이 추상적인 효과만 설명합니다."
  }
]
```

---

## 11.2 초기 Rule

```text
UNS001 stock-phrase
UNS002 excessive-transition
UNS003 repeated-opener
UNS004 excessive-hedging
UNS005 abstract-noun-chain
UNS006 redundant-summary
UNS007 repetitive-structure
UNS008 excessive-signposting
UNS009 filler-sentence
UNS010 repeated-vocabulary
```

---

## 11.3 Core 구조

```text
                    unslop
                       │
              ┌────────┴────────┐
              │                 │
        deterministic        semantic
           linter             analyzer
              │                 │
      regex / structure       optional LLM
      repetition / phrases    redundancy
      cadence / hedging       empty claims
              │                 │
              └───────┬─────────┘
                      ↓
                  Findings
```

---

## 11.4 기술 원칙

기본 기능:

> **Offline + Deterministic**

LLM은 optional plugin으로 둔다.

```text
@unslop/core
@unslop/rules-ko
@unslop/rules-en

@unslop/openai
@unslop/anthropic
@unslop/ollama
```

---

# 12. 8단계 — CLI 공개

첫 사용자 인터페이스는 웹 에디터가 아니라 CLI로 한다.

```bash
npm install -g unslop
```

```bash
unslop check README.md
```

결과 예:

```text
README.md

12:4 warning
"이를 통해"
Repeated transition
UNS002

26:1 warning
3 consecutive paragraphs start with
"또한"
UNS003

3 problems
Slop density: 7.2 / 1k words
```

JSON 지원:

```bash
unslop check README.md --format json
```

이 기능을 통해 다른 개발자가 Unslop을 쉽게 통합할 수 있다.

---

# 13. 9단계 — Open Source 배포

## 13.1 목표

초기 OSS의 목적은 단순 GitHub Star 확보가 아니다.

다음 데이터를 얻는 것이다.

- 어떤 문서에 쓰는지
- 어떤 rule이 유용한지
- 어떤 rule에서 false positive가 발생하는지
- 어떤 언어 요청이 많은지
- 어느 워크플로에 통합하고 싶은지
- 어떤 기능에 돈을 낼 수 있는지

---

## 13.2 초기 사용자 피드백

GitHub Issue 자체를 고객 인터뷰 채널로 사용한다.

예:

> 한국어에서 `이를 통해`가 너무 많이 잡힙니다.

> README에서 false positive가 발생합니다.

> Google Docs에서도 쓰고 싶습니다.

> 사내 문체 규칙을 추가하고 싶습니다.

이런 요청이 이후 상용 제품 방향을 결정한다.

---

# 14. 10단계 — 상용화 검증

Open Source 사용자가 쌓인 뒤 유료화 가능성을 검증한다.

## 14.1 개인용 제품

가능한 제품:

### Unslop Editor

```text
문서 입력
↓
Slop Scan
↓
문제 하이라이트
↓
수정 제안
↓
전체 Rewrite
```

### Browser Extension

- Google Docs
- Notion
- Gmail
- 기타 Web Editor

### Desktop / Editor Extension

- VS Code
- Obsidian
- Markdown Editor

---

## 14.2 조직용 제품

조직에서 더 큰 기회가 발생할 수 있다.

예:

### Organization Style Engine

조직별 문체 규칙:

```text
우리 회사에서는
"효율적인 방향성" 사용 금지

문장은 2줄 이하

결론 먼저 작성

숫자는 가능한 경우 포함

담당자와 기한 명시
```

Unslop을 조직 문서 QA 엔진으로 확장한다.

---

# 15. 장기 제품 비전

최종적으로 Unslop은 독립 문서 에디터에만 머물 필요가 없다.

```text
                       Google Docs
                           │
                           │
Notion ─────────── Unslop Quality Layer ─────────── Gmail
                           │
                           │
                        Slack
                           │
                           │
                         Word
```

즉:

> **조직이 생성하고 소비하는 모든 텍스트의 품질을 검사하는 Layer**

로 확장할 수 있다.

---

# 16. 사업 모델

## 16.1 Open Source

무료:

- Core Linter
- 기본 Rule
- CLI
- 기본 Benchmark
- Community Rule

목적:

- 사용자 유입
- 브랜드 신뢰
- 개발자 생태계
- 문제 데이터 확보

---

## 16.2 개인 구독

예시:

```text
Free
₩0

Personal
₩9,900 ~ ₩19,000 / month
```

유료 기능 후보:

- Semantic Rewrite
- 긴 문서 분석
- History
- Custom Rule
- Browser Extension
- Team Style
- 개인 문체 프로필

---

## 16.3 Team / B2B

가능 기능:

- 조직 문체 가이드 적용
- 팀별 Custom Rule
- 문서 품질 Score
- 관리자 Dashboard
- API
- 사내 문서 시스템 통합
- Private deployment
- 데이터 비저장 옵션

---

# 17. 초기 고객

가장 먼저 볼 고객은:

```text
AI를 많이 쓰면서
+
문서 품질에 민감한 사람
```

초기 후보:

1. PM / 서비스 기획자
2. 마케터
3. 개발자 / Technical Writer
4. 스타트업 대표
5. 콘텐츠 작성자
6. 보고서 작성이 많은 사무직

특히 OSS 초기 사용자는 자연스럽게:

- AI를 자주 쓰고
- 결과 품질을 신경 쓰며
- 새로운 도구를 직접 설치할 의지가 있는

고밀도 잠재 고객군이 된다.

---

# 18. 핵심 성장 루프

```text
Unslop Challenge
      ↓
사람들이 게임 참여
      ↓
Benchmark 데이터 증가
      ↓
Unslop Core 정확도 증가
      ↓
OSS 사용자 증가
      ↓
Issue / Feedback 증가
      ↓
새로운 Rule / 데이터 증가
      ↓
제품 정확도 증가
      ↓
유료 사용자 전환
```

가장 중요한 점은:

> **사용자 증가가 곧 데이터 증가로 연결되는 구조**

를 만드는 것이다.

---

# 19. 첫 30일 실행 계획

현재 조건:

- 퇴직까지 약 1개월
- 가용 현금 약 100만원

따라서 첫 달의 목표는 완성된 사업이 아니다.

> **Unslop이라는 문제 정의가 실제 사용자 반응을 얻는지 검증하는 것**

이다.

---

## Week 1 — 문제와 데이터 구조 확정

완료 목표:

- Slop Taxonomy v0.1
- Prompt Bank 60개 초안
- 데이터 Schema
- Annotation Guideline
- Challenge UX Wireframe
- Repository 생성

산출물:

```text
unslop-bench
```

---

## Week 2 — Challenge MVP

완료 목표:

- A/B 문장 비교 화면
- Human / AI 선택
- Confidence 선택
- Preference 선택
- Span 선택
- Category 선택
- 결과 화면
- 기본 Score

목표:

> 외부 사용자가 실제로 10문제를 플레이할 수 있는 상태

---

## Week 3 — 데이터 수집 시작

목표:

- Human 문서 60개
- LLM 문서 240개
- Hard Negative 50개
- Challenge 참가자 100명+

최소 판단 수:

```text
1,000 judgments
```

---

## Week 4 — Benchmark v0.1

완료 목표:

- weak annotation 집계
- high-agreement sample 추출
- 100~200개 정밀 검수
- benchmark split
- 첫 benchmark scorecard
- GitHub 공개

목표:

> **Core를 개발하기 위한 첫 번째 Frozen Benchmark 확보**

---

# 20. 퇴직 후 60일 계획

## Month 2

### Unslop Core v0.1

- Rule Engine
- 10개 초기 Rule
- Korean rule
- CLI
- JSON output
- CI Benchmark

목표:

```text
Precision ≥ 90%
Human False Positive ≤ 5%
```

---

## Month 3

### OSS Distribution

- GitHub 공개
- Hacker News / Reddit / X / 국내 개발 커뮤니티
- Challenge 재확산
- Issue 기반 개선
- VS Code 또는 Browser Extension 검토

목표 예:

```text
GitHub Stars          300+
Active Users           50+
Feedback / Issues      30+
Weekly Repeat Users    20+
```

숫자 자체보다 **반복 사용과 구체적인 문제 제보**를 중요하게 본다.

---

# 21. 초기 예산

총 가용금:

**1,000,000원**

권장 배분:

| 항목 | 예산 |
|---|---:|
| 도메인 / 기본 인프라 | 50,000 |
| LLM API | 100,000 |
| Human Writing 보상 | 150,000 |
| Annotation 보상 | 150,000 |
| Challenge 이벤트 경품 | 100,000 |
| 필요한 SaaS | 50,000 |
| 디자인 | 0 |
| 개발 외주 | 0 |
| 광고 | 0 |
| 법인 설립 | 0 |
| 예비비 | 400,000 |

원칙:

> 초기 자금은 제품을 만드는 돈이 아니라 **문제를 검증하고 데이터를 확보하는 돈**으로 사용한다.

---

# 22. 초기 KPI

## 데이터 KPI

```text
Writing Task                60+
Raw Documents              450+
Crowd Judgments          5,000+
Gold Annotated Samples     200+
```

## Benchmark KPI

```text
Precision                  90%+
Recall                     60%+
Human False Positive        <5%
Hard Negative FP           <10%
Meaning Preservation       4.5/5+
```

## Community KPI

```text
Challenge Participants     500+
OSS Users                   50+
GitHub Issues / Feedback    20+
Repeat Users                20+
```

## 사업 KPI

```text
Potential Customer Interview 20+
Payment Intent                5+
Paid Pilot                    1+
```

---

# 23. 주요 리스크

## 23.1 “AI Slop” 정의가 너무 주관적일 수 있음

대응:

- Inter-Annotator Agreement 측정
- agreement가 낮은 category 제거
- taxonomy를 데이터 기반으로 지속 수정

---

## 23.2 단순 금칙어 필터가 될 위험

대응:

- Hard Negative 대량 수집
- 문서 단위 반복 탐지
- context-aware rule
- semantic analyzer를 후행으로 추가

---

## 23.3 Generic GPT Rewrite보다 못할 가능성

대응:

Benchmark에서 반드시:

```text
Unslop
vs
Generic GPT Rewrite
```

를 비교한다.

Unslop이 이기지 못하면 제품 전략을 재검토한다.

---

## 23.4 AI Detector로 오해받을 가능성

Unslop의 메시지를 지속적으로 다음과 같이 유지한다.

> **We don't detect who wrote it. We detect bad writing.**

---

## 23.5 OSS가 사용자만 만들고 매출로 연결되지 않을 위험

대응:

OSS 단계에서부터 다음 요청을 추적한다.

- Custom Rule
- Team Style
- Google Docs Integration
- Private Deployment
- API
- Team Dashboard

이 중 반복적으로 등장하는 요구를 상용 제품으로 전환한다.

---

# 24. 성공 판단 기준

초기 90일 후 다음 질문에 답한다.

### 문제

> 사람들이 실제로 AI 문체를 문제라고 느끼는가?

### 데이터

> Slop을 평가자 간 합의 가능한 형태로 정의할 수 있는가?

### 기술

> Unslop이 높은 Precision으로 문제를 탐지할 수 있는가?

### 제품

> 사용자가 반복적으로 문서를 검사하는가?

### 사업

> 무료 OSS 이상으로 비용을 지불할 요구가 존재하는가?

---

# 25. Go / Pivot 기준

## GO

다음 조건이 충족되면 계속 진행한다.

```text
Benchmark Precision ≥ 90%

Human FP ≤ 5%

Challenge 참여자들이
반복적으로 같은 slop pattern을 지적

OSS repeat user 발생

유료 기능 요청 반복

최소 1개 Paid Pilot
```

---

## PIVOT

다음 상황이면 방향을 수정한다.

```text
Slop taxonomy에 평가자 합의가 없음

Generic GPT Rewrite가 계속 우위

사람들이 Slop 탐지는 좋아하지만
실제 workflow에서는 사용하지 않음

OSS 사용은 있으나
유료 요구가 전혀 없음
```

Pivot 후보:

- AI 문체 제거 → 조직용 문체 QA
- 개인용 → B2B Style Guide
- Rewrite → Document Linting
- 에디터 → API / Quality Layer

---

# 26. Unslop이 장기적으로 가져야 할 자산

Unslop의 핵심 자산은 단순 코드가 아니다.

## Asset 1 — Slop Taxonomy

> AI 시대의 나쁜 문체를 어떻게 정의할 것인가

## Asset 2 — Unslop Benchmark

> 이를 어떻게 객관적으로 측정할 것인가

## Asset 3 — Human Preference Data

> 사람이 실제로 어떤 글을 더 좋은 글이라고 판단하는가

## Asset 4 — Hard Negative Corpus

> 무엇을 건드리지 않아야 하는가

## Asset 5 — Open Source Community

> 실제 사용자가 어떤 문제를 지속적으로 경험하는가

## Asset 6 — Organization Style Data

> 각 조직이 어떤 문체를 좋은 문체라고 보는가

---

# 27. 최종 사업 구조

```text
                  Unslop Challenge
                         │
                         ↓
                    Human Data
                         │
                         ↓
                  Unslop Benchmark
                         │
                         ↓
                    Unslop Core
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
          Open Source             API
              │                     │
              ↓                     ↓
       Individual Users         B2B Product
              │                     │
              └──────────┬──────────┘
                         ↓
                  AI Writing Quality
                       Platform
```

---

# 28. 최종 비전

AI가 모든 글을 대신 써주는 시대가 올수록, 중요한 것은 “더 많이 생성하는 것”이 아니라 **생성된 텍스트 중 무엇이 좋은 글인지 판단하는 능력**이 된다.

Unslop은 생성 자체가 아니라 그 다음 단계를 목표로 한다.

> **AI가 만든 텍스트를 더 많이 생산하는 회사가 아니라, AI 시대의 텍스트 품질 기준을 만드는 회사.**

장기적으로 Unslop은:

> **The quality layer for AI-generated writing.**

이 되는 것을 목표로 한다.

---

# 29. 당장 시작할 순서

```text
TODAY
│
├─ 1. Slop Taxonomy v0.1 작성
│
├─ 2. Prompt Bank 60개 작성
│
├─ 3. Benchmark Schema 확정
│
└─ 4. Challenge 화면 설계

↓
NEXT

5. Human / AI Raw Corpus 생성

↓

6. Unslop Challenge 공개

↓

7. Crowd Annotation 확보

↓

8. Gold Benchmark v0.1 제작

↓

9. Unslop Core 개발

↓

10. GitHub OSS 공개

↓

11. 사용자의 반복 요구 분석

↓

12. 상용 제품 결정
```

---

# 결론

현재 시점에서 Unslop이 가장 먼저 해야 할 일은 AI 문서 에디터를 만드는 것이 아니다.

첫 번째 제품은:

> **Unslop Challenge**

첫 번째 기술 자산은:

> **Unslop Benchmark**

첫 번째 오픈소스 제품은:

> **Unslop Core**

그리고 이 세 개가 연결된 이후에야:

> **Unslop Editor / Team Product / API**

를 만든다.

즉 사업의 순서는 다음 한 줄로 정리할 수 있다.

> **사람의 판단을 모아 문제를 정의하고 → Benchmark로 측정하고 → Core로 해결하고 → OSS로 사용자를 확보하고 → 반복적으로 나타나는 요구를 유료 제품으로 만든다.**
