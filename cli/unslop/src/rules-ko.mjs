// 한국어 규칙 UNS001~UNS010. 사업계획서 11.2절의 초기 Rule을 Slop Taxonomy v0.2의 유형에 대응시킨다.
// 모든 규칙은 오프라인·결정적이며 단서를 찾는다. 문맥 판정(문제인지 정상인지)은 사람이 한다. 따라서 severity는
// 문맥 없이도 방해가 분명한 경우에만 warning, 나머지는 info다. fixable인 규칙만 의미를 보존하는 자동 수정을 제안한다.
//
// 규칙 인터페이스: (ctx) => Finding[]
//   ctx = { text, cps, sentences, paragraphs, protectedRanges, options }
//   Finding = { ruleId, name, taxonomy, severity, start, end, message, fix?: { start, end, replacement } }
import { cps, inRanges, words, stem } from './text.mjs';

const finding = (rule, s, e, message, extra = {}) => ({ ruleId: rule.id, name: rule.name, taxonomy: rule.taxonomy, severity: rule.severity, start: s, end: e, message, ...extra });
const cpLen = (s) => cps(s).length;
const clean = (s) => s.replace(/[\s\p{P}\p{S}]/gu, '');
const bigrams = (s) => { const c = cps(clean(s)); const set = new Set(); for (let i = 0; i < c.length - 1; i += 1) set.add(c[i] + c[i + 1]); return set; };
const jaccard = (a, b) => { let inter = 0; for (const x of a) if (b.has(x)) inter += 1; const union = a.size + b.size - inter; return union ? inter / union : 0; };
const withinSentence = (sent, offsetInSentence, length) => [sent.start + offsetInSentence, sent.start + offsetInSentence + length];

// 문장 안의 정규식 일치를 코드 포인트 좌표로 돌려준다.
function matchesIn(sent, re) {
  const out = [];
  for (const m of sent.text.matchAll(re)) {
    const offset = cpLen(sent.text.slice(0, m.index));
    out.push({ m, start: sent.start + offset, end: sent.start + offset + cpLen(m[0]) });
  }
  return out;
}

// ---------- UNS001 stock-phrase → empty-expression ----------
const STOCK_PHRASES = [
  '다양한 관점에서', '다각적인 관점에서', '보다 효율적인', '보다 나은', '한층 더', '혁신적이고', '획기적인', '차별화된 가치', '시너지를 창출',
  '적극적으로 노력', '최선을 다하', '지속적으로 노력', '긍정적인 영향을 미칠', '중요한 역할을 담당', '중요한 의미를 갖', '핵심적인 역할',
  '효과적으로 대응', '체계적으로 관리', '다양한 방안을 모색', '개선 방향을 모색', '심도 있는 논의', '전방위적', '아낌없는', '뜻깊은',
];
export const UNS001 = {
  id: 'UNS001', name: 'stock-phrase', taxonomy: 'empty-expression', severity: 'info', fixable: false,
  run(ctx) {
    const out = [];
    for (const sent of ctx.sentences) {
      for (const phrase of STOCK_PHRASES) {
        for (const { start, end } of matchesIn(sent, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) {
          if (inRanges(ctx.protectedRanges, start, end)) continue;
          out.push(finding(UNS001, start, end, `상투적 표현 “${phrase}”. 설명할 성질이나 차이를 대신하고 있는지 확인하세요. 뒤에 구체적 내용이 따라오면 정상입니다.`));
        }
      }
    }
    return out;
  },
};

// ---------- UNS002 excessive-transition → unnecessary-transition ----------
const TRANSITIONS = ['또한', '이를 통해', '이러한', '이에 따라', '따라서', '그리고', '하지만', '그러나', '한편', '아울러', '더불어', '나아가', '이와 함께', '이처럼', '결과적으로', '즉'];
const TRANSITION_RE = new RegExp(`^(${TRANSITIONS.join('|')})[,\\s]`);
export const UNS002 = {
  id: 'UNS002', name: 'excessive-transition', taxonomy: 'unnecessary-transition', severity: 'warning', fixable: true,
  run(ctx) {
    const out = [];
    const starts = ctx.sentences.map((s) => { const m = s.text.match(TRANSITION_RE); return m ? m[1] : null; });
    // 같은 접속어가 연속 문장 첫머리에 반복되면 두 번째부터 표시한다. 연속 반복은 관계 표시 기능을 잃는다.
    for (let i = 1; i < ctx.sentences.length; i += 1) {
      if (starts[i] && starts[i] === starts[i - 1]) {
        const sent = ctx.sentences[i];
        const m = sent.text.match(TRANSITION_RE);
        const [s, e] = withinSentence(sent, 0, cpLen(m[0]));
        // 표시는 접속어만, 수정은 뒤따르는 쉼표·공백까지 지운다.
        out.push(finding(UNS002, s, s + cpLen(starts[i]), `앞 문장과 같은 접속어 “${starts[i]}”로 시작합니다. 연속 반복은 문장 관계를 표시하지 못합니다.`, {
          fix: { start: s, end: e, replacement: '' },
        }));
      }
    }
    // 밀도: 1,000자당 접속어 시작 문장 8개 초과면 문서 단위로 한 번 표시한다.
    const total = ctx.cps.length;
    const n = starts.filter(Boolean).length;
    if (total >= 500 && n / total * 1000 > 8) {
      out.push(finding({ ...UNS002, severity: 'info' }, 0, 0, `접속어로 시작하는 문장이 1,000자당 ${(n / total * 1000).toFixed(1)}개입니다. 관계가 뒷받침되지 않는 접속어가 있는지 확인하세요.`));
    }
    return out;
  },
};

// ---------- UNS003 repeated-opener → repetitive-structure ----------
export const UNS003 = {
  id: 'UNS003', name: 'repeated-opener', taxonomy: 'repetitive-structure', severity: 'warning', fixable: false,
  run(ctx) {
    const out = [];
    const openers = ctx.sentences.map((s) => (words(s.text)[0] ?? '').replace(/[,.]$/, ''));
    let run = 1;
    for (let i = 1; i <= ctx.sentences.length; i += 1) {
      if (i < ctx.sentences.length && openers[i] && openers[i] === openers[i - 1]) { run += 1; continue; }
      if (run >= 3) {
        const first = ctx.sentences[i - run];
        const last = ctx.sentences[i - 1];
        out.push(finding(UNS003, first.start, last.end, `문장 ${run}개가 연속으로 “${openers[i - 1]}”로 시작합니다. 같은 틀이 내용의 차이나 수행 조건을 가리는지 확인하세요.`));
      }
      run = 1;
    }
    return out;
  },
};

// ---------- UNS004 excessive-hedging → excessive-hedging ----------
const HEDGES = ['것으로 보입니다', '것으로 예상됩니다', '것으로 판단됩니다', '것으로 생각됩니다', '것으로 사료됩니다', '수 있을 것', '수도 있', '아마', '다소', '어느 정도', '일부', '가능성이 있', '경우에 따라', '~쯤', '정도로 보', '듯합니다', '듯하다'];
export const UNS004 = {
  id: 'UNS004', name: 'excessive-hedging', taxonomy: 'excessive-hedging', severity: 'warning', fixable: true,
  run(ctx) {
    const out = [];
    for (const sent of ctx.sentences) {
      const hits = [];
      for (const h of HEDGES) for (const { start, end } of matchesIn(sent, new RegExp(h.replace(/[.*+?^${}()|[\]\\~]/g, '\\$&'), 'g'))) hits.push({ h, start, end });
      if (hits.length >= 2) {
        hits.sort((a, b) => a.start - b.start);
        const f = finding(UNS004, hits[0].start, hits[hits.length - 1].end, `한 문장에 유보 표현이 ${hits.length}개 겹칩니다(${hits.map((x) => `“${x.h}”`).join(', ')}). 무엇이 얼마나 불확실한지 알기 어렵습니다.`);
        // 안전한 수정 하나만 제안한다: “수 있을 것으로 보입니다/예상됩니다” → “것으로 보입니다/예상됩니다”. 조건·권한·기능의 “수 있다”는 건드리지 않는다.
        const m = matchesIn(sent, /수 있을 것으로 (보입니다|예상됩니다|판단됩니다)/g)[0];
        if (m) f.fix = { start: m.start, end: m.end, replacement: `것으로 ${m.m[1]}` };
        out.push(f);
      }
    }
    return out;
  },
};

// ---------- UNS005 abstract-noun-chain → vague-claim ----------
export const UNS005 = {
  id: 'UNS005', name: 'abstract-noun-chain', taxonomy: 'vague-claim', severity: 'info', fixable: false,
  run(ctx) {
    const out = [];
    // 추상 명사(…화/성/력/방안/역량/체계/기반/가치/효율/혁신/전략/고도화)가 3개 이상 이어지는 어절 연쇄
    const re = /(?:[가-힣]{0,6}(?:화|성|력|방안|역량|체계|기반|가치|효율|혁신|전략|고도화|최적화|활성화|내재화|극대화)\s+){2,}[가-힣]{0,6}(?:화|성|력|방안|역량|체계|기반|가치|효율|혁신|전략|고도화|최적화|활성화|내재화|극대화|추진|마련|도모|강화|제고)(?:을|를|의|이|가|으로|에|은|는)?(?=[\s.,]|$)/g;
    for (const sent of ctx.sentences) {
      for (const { m, start, end } of matchesIn(sent, re)) {
        if (inRanges(ctx.protectedRanges, start, end)) continue;
        out.push(finding(UNS005, start, end, `추상 명사가 이어집니다: “${m[0]}”. 누가 무엇을 하는지, 어떤 근거인지 문맥에 있는지 확인하세요.`));
      }
    }
    return out;
  },
};

// ---------- UNS006 redundant-summary → redundant-content ----------
export const UNS006 = {
  id: 'UNS006', name: 'redundant-summary', taxonomy: 'redundant-content', severity: 'warning', fixable: true,
  run(ctx) {
    const out = [];
    const grams = ctx.sentences.map((s) => bigrams(s.text));
    for (let i = 1; i < ctx.sentences.length; i += 1) {
      const cur = ctx.sentences[i];
      if (cpLen(clean(cur.text)) < 10) continue;
      // 바로 앞 문장 또는 같은 문단 안의 앞 문장들과 비교한다.
      for (let j = i - 1; j >= 0 && j >= i - 4; j -= 1) {
        const prev = ctx.sentences[j];
        if (prev.paragraph !== cur.paragraph && j !== i - 1) break;
        const sim = jaccard(grams[i], grams[j]);
        const restates = /^(즉|다시 말해|바꿔 말하면|요컨대|결론적으로|정리하면)[,\s]/.test(cur.text);
        // 재진술 표지가 있으면 어간 단위 겹침도 본다. “기한은 금요일입니다 / 즉, 금요일까지 …” 같은 바꿔 말하기를 잡기 위해서다.
        const root = (w) => stem(w).replace(/(입니다|습니다|합니다|됩니다|했습니다|해야|한다는|하는|이다|한다|된다)$/u, '');
        const rootsPrev = words(prev.text).map(root).filter((w) => cpLen(w) >= 2);
        const rootsCur = words(cur.text).map(root).filter((w) => cpLen(w) >= 2 && !/^(즉|다시|말해|바꿔|말하면|요컨대|결론적으로|정리하면)$/.test(w));
        const shares = (a) => rootsPrev.some((b) => a.startsWith(b) || b.startsWith(a));
        const stemOverlap = rootsCur.length ? rootsCur.filter(shares).length / rootsCur.length : 0;
        if (sim >= 0.6 || (restates && (sim >= 0.4 || stemOverlap >= 0.3))) {
          const f = finding(UNS006, cur.start, cur.end, `앞 문장(${prev.text.slice(0, 20)}…)과 내용이 ${Math.round(sim * 100)}% 겹칩니다. 새 조건이나 근거를 더하지 않으면 불필요한 재진술입니다.`, { related: { start: prev.start, end: prev.end } });
          // 겹침이 매우 높을 때만 삭제를 제안한다. 문장 앞의 공백까지 함께 지운다.
          if (sim >= 0.8 || (restates && sim >= 0.6)) {
            let s = cur.start;
            while (s > 0 && ctx.cps[s - 1] === ' ') s -= 1;
            f.fix = { start: s, end: cur.end, replacement: '' };
          }
          out.push(f);
          break;
        }
      }
    }
    return out;
  },
};

// ---------- UNS007 repetitive-structure → repetitive-structure ----------
export const UNS007 = {
  id: 'UNS007', name: 'repetitive-structure', taxonomy: 'repetitive-structure', severity: 'info', fixable: false,
  run(ctx) {
    const out = [];
    const ending = (s) => { const w = words(s.text); return w.length ? stem(w[w.length - 1]).slice(-4) : ''; };
    const ends = ctx.sentences.map(ending);
    let run = 1;
    for (let i = 1; i <= ctx.sentences.length; i += 1) {
      const same = i < ctx.sentences.length && ends[i] && ends[i] === ends[i - 1] && cpLen(ends[i]) >= 3;
      if (same) { run += 1; continue; }
      if (run >= 4) {
        const first = ctx.sentences[i - run];
        const last = ctx.sentences[i - 1];
        out.push(finding(UNS007, first.start, last.end, `문장 ${run}개가 연속으로 “…${ends[i - 1]}”로 끝납니다. 항목별 차이(필수·선택·조건)가 같은 틀에 묻히는지 확인하세요.`));
      }
      run = 1;
    }
    return out;
  },
};

// ---------- UNS008 excessive-signposting → excessive-signposting ----------
const SIGNPOST_RE = /^(아래에서|이 글에서는|본 문서에서는|지금부터|이번 글에서는|여기서는|다음으로는|이제)\s.*(안내해 드리겠습니다|안내하겠습니다|설명하겠습니다|설명해 드리겠습니다|살펴보겠습니다|알아보겠습니다|말씀드리겠습니다|소개하겠습니다|정리해 보겠습니다)[.!]?$|^(요약하면|정리하면) 다음과 같습니다[.!]?$/;
export const UNS008 = {
  id: 'UNS008', name: 'excessive-signposting', taxonomy: 'excessive-signposting', severity: 'warning', fixable: true,
  run(ctx) {
    const out = [];
    const short = ctx.cps.length < 1500;
    for (const sent of ctx.sentences) {
      if (!SIGNPOST_RE.test(sent.text)) continue;
      const f = finding({ ...UNS008, severity: short ? 'warning' : 'info' }, sent.start, sent.end, short
        ? '짧은 글에서 본문을 예고하는 안내 문장입니다. 안내할 구조가 없으면 답을 늦춥니다.'
        : '본문을 예고하는 안내 문장입니다. 긴 글에서는 탐색을 돕는지 확인하세요.');
      if (short) {
        let e = sent.end;
        while (e < ctx.cps.length && (ctx.cps[e] === ' ' || ctx.cps[e] === '\n') && !(ctx.cps[e] === '\n' && ctx.cps[e + 1] === '\n')) e += 1;
        f.fix = { start: sent.start, end: e, replacement: '' };
      }
      out.push(f);
    }
    return out;
  },
};

// ---------- UNS009 filler-sentence → empty-expression / vague-claim ----------
const FILLER_RE = /^(이는|이것은|이러한 점은|이 부분은|위 내용은)?\s*(매우|아주|상당히)?\s*(중요한|의미 있는|필요한|핵심적인)\s*(부분|사항|요소|의미|과제)(입니다|이다|라고 할 수 있습니다|라 할 수 있다)[.!]?$|^(많은 관심|많은 참여|아낌없는 성원)(과 (관심|참여|성원))? 부탁드립니다[.!]?$/;
export const UNS009 = {
  id: 'UNS009', name: 'filler-sentence', taxonomy: 'vague-claim', severity: 'info', fixable: false,
  run(ctx) {
    const out = [];
    for (const sent of ctx.sentences) {
      if (FILLER_RE.test(sent.text)) out.push(finding(UNS009, sent.start, sent.end, '평가만 있고 대상·근거가 없는 문장입니다. 무엇이 왜 중요한지 문맥에 있는지 확인하세요. 예의를 전하는 마무리는 정상일 수 있습니다.'));
    }
    return out;
  },
};

// ---------- UNS010 repeated-vocabulary → empty-expression(단서) ----------
const STOP = new Set(['있습니다', '합니다', '됩니다', '입니다', '것으로', '있는', '하는', '위해', '대한', '통해', '경우', '이번', '해당', '관련', '또한', '그리고', '따라서', '이를', '이러한', '있다', '한다', '된다', '것이다', '수', '등', '및']);
export const UNS010 = {
  id: 'UNS010', name: 'repeated-vocabulary', taxonomy: 'empty-expression', severity: 'info', fixable: false,
  run(ctx) {
    const out = [];
    const W = 3; // 문장 창
    const seen = new Set();
    for (let i = 0; i + W <= ctx.sentences.length; i += 1) {
      const window = ctx.sentences.slice(i, i + W);
      const count = new Map();
      for (const s of window) for (const w of words(s.text)) {
        const st = stem(w);
        if (cpLen(st) < 2 || STOP.has(w) || STOP.has(st)) continue;
        count.set(st, (count.get(st) ?? 0) + 1);
      }
      for (const [st, n] of count) {
        if (n >= 5 && !seen.has(`${st}|${window[0].start}`)) {
          seen.add(`${st}|${window[0].start}`);
          // 같은 어휘의 반복은 주제어일 수 있다. 정보성 표시만 한다.
          out.push(finding(UNS010, window[0].start, window[W - 1].end, `문장 ${W}개 안에 “${st}”가 ${n}번 나옵니다. 주제어의 반복이면 정상입니다.`));
        }
      }
    }
    return out;
  },
};

export const RULES_KO = [UNS001, UNS002, UNS003, UNS004, UNS005, UNS006, UNS007, UNS008, UNS009, UNS010];
