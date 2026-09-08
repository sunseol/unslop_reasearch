// 한국어 문서를 문장 단위로 나눈다. 좌표는 데이터 Schema대로 코드 포인트 인덱스(start 포함, end 미포함)다.
// 규칙(첫 구현): 줄바꿈은 항상 경계다. 한 줄 안에서는 . ! ? 。 뒤에 공백이 오면 경계로 본다.
// 마침표 뒤에 숫자·영문이 바로 이어지면(버전, 소수, URL) 경계가 아니다. 오분리 사례는 모아 규칙을 고친다.
import { normalizeText } from '../../scripts/text.mjs';

export function splitSentences(text) {
  const cps = Array.from(normalizeText(text));
  const out = [];
  let start = 0;
  let paragraph = 0;
  let newParagraph = true;
  const push = (end) => {
    const raw = cps.slice(start, end).join('');
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const s = start + Array.from(raw.slice(0, lead)).length;
    const e = end - Array.from(raw.slice(raw.length - trail)).length;
    if (e > s) {
      out.push({ start: s, end: e, text: cps.slice(s, e).join(''), paragraph, newParagraph });
      newParagraph = false;
    }
    start = end;
  };
  for (let i = 0; i < cps.length; i += 1) {
    const ch = cps[i];
    if (ch === '\n') {
      push(i);
      start = i + 1;
      if (cps[i + 1] === '\n') {
        paragraph += 1;
        newParagraph = true;
      }
      continue;
    }
    if ('.!?。'.includes(ch)) {
      const next = cps[i + 1];
      if (next === undefined || next === ' ' || next === '\n') {
        if (!(ch === '.' && /[0-9A-Za-z]/.test(next ?? ''))) push(i + 1);
      }
    }
  }
  push(cps.length);
  return out;
}
