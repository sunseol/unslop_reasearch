// Unslop Challenge 화면. 상태 기계: S0 → S1 → Q1 → Q2 → Q3 → Q4 → Q5 → R → (반복) → F
(() => {
  const app = document.getElementById('app');
  const CATEGORIES = [
    ['verbose', '장황하다'], ['abstract', '추상적이다'], ['cliche', '뻔한 표현이다'], ['repetitive', '반복적이다'],
    ['overexplained', '과하게 설명한다'], ['translated', '번역체 같다'], ['ai-structure', '문장 구조가 AI스럽다'],
  ];
  const CONFIDENCE = [['guess', '찍었다'], ['slight', '약간 확신'], ['fairly', '꽤 확신'], ['certain', '확실하다']];

  const state = { session: null, pair: null, answer: null, t: {}, total: 10 };

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const render = (...nodes) => { app.replaceChildren(...nodes.flat()); window.scrollTo(0, 0); };
  const api = async (path, body) => {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { method: path === '/api/session' ? 'POST' : 'GET' });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.json();
  };
  const now = () => Date.now();

  function progress() {
    const dots = [];
    for (let i = 0; i < state.total; i += 1) dots.push(el('i', { class: i < state.pair.index ? 'on' : '' }));
    return el('div', { class: 'progress' }, el('strong', {}, `${state.pair.index} / ${state.total}`), el('span', { class: 'dots' }, dots));
  }
  function taskCard() {
    const t = state.pair.task;
    return el('div', { class: 'task' }, el('div', {}, el('b', {}, '과제: '), t.title), el('div', {}, el('b', {}, '독자: '), t.reader));
  }
  function docView(label, doc, selectable) {
    const body = el('div', { class: 'body' });
    let p = null;
    for (const s of doc.sentences) {
      if (!p || s.newParagraph) { p = el('div', { class: 'p' }); body.append(p); }
      const span = el('span', { class: 'sent', 'data-doc': doc.id, 'data-start': s.start, 'data-end': s.end }, s.text, ' ');
      if (selectable) {
        span.addEventListener('click', () => { span.classList.toggle('selected'); updateSelectedCount(); });
      }
      p.append(span);
    }
    return el('section', { class: `doc${selectable ? ' selectable' : ''}` }, el('span', { class: 'label' }, label), body);
  }
  function docsView(selectable) {
    return el('div', { class: 'docs' }, docView('A', state.pair.A, selectable), docView('B', state.pair.B, selectable));
  }
  function updateSelectedCount() {
    const n = document.querySelectorAll('.sent.selected').length;
    const c = document.getElementById('selcount');
    if (c) c.textContent = `선택 ${n}개`;
  }

  // ----- S0 -----
  function screenStart() {
    render(
      el('h1', {}, 'Can You Spot the Slop?'),
      el('p', {}, 'AI 시대, 당신은 AI가 쓴 글을 구별할 수 있습니까?'),
      el('p', {}, `같은 주제로 쓴 두 글을 읽고 어느 쪽이 AI가 쓴 글인지, 어느 쪽이 더 좋은 글인지 골라 주세요. ${state.total}쌍, 약 10분.`),
      el('div', { class: 'actions' }, el('button', { class: 'primary', onclick: start }, '시작하기')),
      el('div', { class: 'consent' },
        el('p', { class: 'muted' }, '응답은 익명으로 저장되며 문체 품질 연구 데이터로 사용됩니다. 시작하기를 누르면 이에 동의한 것으로 봅니다.'),
        el('details', {}, el('summary', {}, '무엇을 저장하나요?'),
          el('ul', {},
            el('li', {}, '각 쌍에 대한 추측, 확신 정도, 선호, 선택한 문장, 고른 이유, 질문별 응답 시간'),
            el('li', {}, '무작위로 만든 세션 번호. 이름, 이메일, IP 주소는 저장하지 않습니다.'),
            el('li', {}, '데이터는 공개 벤치마크 제작에 쓰이며 개인을 식별할 수 없는 형태로만 공개됩니다.'))),
      ),
    );
  }
  async function start() {
    try { state.session = localStorage.getItem('unslop.session'); } catch { state.session = null; }
    if (!state.session) {
      const s = await api('/api/session');
      state.session = s.session_id;
      state.total = s.pairs_per_session;
      try { localStorage.setItem('unslop.session', state.session); } catch { /* 저장 불가 */ }
    }
    nextPair();
  }

  // ----- S1 -----
  async function nextPair() {
    const p = await api(`/api/next?session=${encodeURIComponent(state.session)}`);
    if (p.done) return screenFinal();
    state.pair = p;
    state.total = p.total;
    state.answer = { session_id: state.session, pair_id: p.pair_id, selected_spans: [], categories: [], other_text: '', timings_ms: {} };
    state.t.read = now();
    render(progress(), taskCard(), docsView(false),
      el('div', { class: 'actions' }, el('button', { class: 'primary', onclick: () => { state.answer.timings_ms.read = now() - state.t.read; screenQ1(); } }, '다 읽었어요')));
  }

  // ----- Q1 -----
  function screenQ1() {
    state.t.q1 = now();
    const pick = (A, B) => { state.answer.source_guess = { A, B }; state.answer.timings_ms.q1 = now() - state.t.q1; screenQ2(); };
    render(progress(), el('h2', {}, '어느 쪽이 AI가 쓴 글일까요?'),
      el('div', { class: 'choices' },
        el('button', { onclick: () => pick('ai', 'human') }, 'A가 AI'),
        el('button', { onclick: () => pick('human', 'ai') }, 'B가 AI'),
        el('button', { onclick: () => pick('ai', 'ai') }, '둘 다 AI'),
        el('button', { onclick: () => pick('human', 'human') }, '둘 다 사람')));
  }
  // ----- Q2 -----
  function screenQ2() {
    state.t.q2 = now();
    render(progress(), el('h2', {}, '얼마나 확신하세요?'),
      el('div', { class: 'choices' }, CONFIDENCE.map(([v, label]) => el('button', { onclick: () => { state.answer.confidence = v; state.answer.timings_ms.q2 = now() - state.t.q2; screenQ3(); } }, label))));
  }
  // ----- Q3 -----
  function screenQ3() {
    state.t.q3 = now();
    const pick = (v) => { state.answer.preference = v; state.answer.timings_ms.q3 = now() - state.t.q3; screenQ4(); };
    render(progress(), el('h2', {}, `${state.pair.task.reader || '독자'}가 읽는다면 어느 글이 더 좋은가요?`),
      el('div', { class: 'choices' },
        el('button', { onclick: () => pick('A') }, 'A가 낫다'),
        el('button', { onclick: () => pick('B') }, 'B가 낫다'),
        el('button', { onclick: () => pick('similar') }, '비슷하다')));
  }
  // ----- Q4 -----
  function screenQ4() {
    state.t.q4 = now();
    const collect = () => [...document.querySelectorAll('.sent.selected')].map((s) => ({
      document_id: s.dataset.doc, start: Number(s.dataset.start), end: Number(s.dataset.end), quote: s.textContent.trim(),
    }));
    render(progress(), el('h2', {}, 'AI스럽거나 불필요하다고 느낀 부분을 눌러서 표시해 주세요.'),
      el('p', { class: 'muted' }, '문장 단위로 선택됩니다. 없으면 건너뛰기를 누르세요.'),
      docsView(true),
      el('div', { class: 'actions' },
        el('span', { id: 'selcount', class: 'muted' }, '선택 0개'),
        el('button', { onclick: () => { state.answer.selected_spans = []; state.answer.timings_ms.q4 = now() - state.t.q4; submit(); } }, '건너뛰기'),
        el('button', { class: 'primary', onclick: () => { state.answer.selected_spans = collect(); state.answer.timings_ms.q4 = now() - state.t.q4; if (!state.answer.selected_spans.length) return submit(); screenQ5(); } }, '다음')));
  }
  // ----- Q5 -----
  function screenQ5() {
    state.t.q5 = now();
    const other = el('input', { type: 'text', placeholder: '기타 (직접 입력)' });
    const boxes = CATEGORIES.map(([v, label]) => { const cb = el('input', { type: 'checkbox', value: v }); return el('label', {}, cb, label); });
    render(progress(), el('h2', {}, '왜 그렇게 느꼈나요? (복수 선택)'),
      el('div', { class: 'cats' }, boxes, el('label', {}, el('input', { type: 'checkbox', value: 'other', id: 'cat-other' }), other)),
      el('div', { class: 'actions' }, el('button', { class: 'primary', onclick: () => {
        state.answer.categories = [...document.querySelectorAll('.cats input[type=checkbox]:checked')].map((c) => c.value);
        if (other.value.trim() && !state.answer.categories.includes('other')) state.answer.categories.push('other');
        state.answer.other_text = other.value.trim();
        state.answer.timings_ms.q5 = now() - state.t.q5;
        submit();
      } }, '다음')));
  }
  // ----- R -----
  async function submit() {
    let r;
    try { r = await api('/api/response', state.answer); } catch (err) { return render(el('p', { class: 'no' }, `저장 실패: ${err.message}`), el('button', { onclick: nextPair }, '다음 쌍')); }
    const who = (v) => (v === 'ai' ? 'AI가 썼습니다' : '사람이 썼습니다');
    const g = state.answer.source_guess;
    const guessText = g.A === g.B ? (g.A === 'ai' ? '둘 다 AI' : '둘 다 사람') : (g.A === 'ai' ? 'A가 AI' : 'B가 AI');
    render(progress(),
      el('div', { class: 'result' },
        el('h2', {}, '정답'),
        el('div', { class: 'truth' }, el('span', {}, `A: ${who(r.truth.A)}`), el('span', {}, `B: ${who(r.truth.B)}`)),
        el('p', {}, `당신의 추측: ${guessText} `, el('b', { class: r.correct ? 'ok' : 'no' }, r.correct ? '맞았습니다' : '틀렸습니다')),
        r.stats ? el('p', { class: 'muted' }, `참여자 ${r.stats.n}명 중 A를 더 좋은 글로 고른 사람 ${r.stats.preferred.A}명, B ${r.stats.preferred.B}명.`) : null,
        el('p', {}, '누가 썼는지와 글이 좋은지는 다른 문제입니다. 사람이 쓴 글에도, AI가 쓴 글에도 빈 표현과 반복은 생깁니다.')),
      el('div', { class: 'actions' }, el('button', { class: 'primary', onclick: nextPair }, r.answered >= r.total ? '결과 보기' : '다음 쌍')));
  }
  // ----- F -----
  async function screenFinal() {
    const s = await api(`/api/summary?session=${encodeURIComponent(state.session)}`);
    const code = state.session.slice(-6).toUpperCase();
    const share = `Unslop Challenge: AI가 쓴 글 ${s.correct}/${s.answered} 맞힘 (코드 ${code})`;
    render(el('h1', {}, `${s.answered}쌍 완료`),
      el('dl', { class: 'stats' },
        el('dt', {}, '작성 주체 맞힌 비율'), el('dd', {}, `${s.correct} / ${s.answered}`),
        el('dt', {}, '확신했을 때 정답률'), el('dd', {}, s.certain.n ? `${s.certain.correct} / ${s.certain.n}` : '해당 없음'),
        el('dt', {}, '다른 참여자 평균'), el('dd', {}, s.others_avg_correct === null ? '아직 없음' : `${s.others_avg_correct} / ${state.total}`),
        el('dt', {}, '더 좋다고 고른 글 중 AI가 쓴 글'), el('dd', {}, `${s.preferred_ai}개`)),
      el('div', { class: 'actions' },
        el('button', { class: 'primary', onclick: async () => { try { await navigator.clipboard.writeText(share); alert('결과를 복사했습니다.'); } catch { alert(share); } } }, '결과 공유'),
        el('button', { onclick: () => { try { localStorage.removeItem('unslop.session'); } catch { /* 무시 */ } state.session = null; start(); } }, '다시 하기')),
      el('p', { class: 'muted' }, `세션 코드 ${code}. 소식 받기는 준비 중입니다.`));
  }

  screenStart();
})();
