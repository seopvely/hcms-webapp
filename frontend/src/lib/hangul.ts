// 한글 검색 — 초성(ㅌㅆ), 글자(투썸), 섞어 쓰기(투ㅆ) 모두 찾고 일치 정도로 점수를 매긴다.

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const isJamo = (ch: string) => ch >= "ㄱ" && ch <= "ㅎ";

/** 글자 하나의 초성(한글 음절이 아니면 그대로) */
function choOf(ch: string): string {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
}

/** 한글 초성 문자열(예: 유지보수 → ㅇㅈㅂㅅ) */
export function chosung(s: string): string {
  return Array.from(s).map(choOf).join("");
}

/** 비교용 — 소문자, 공백·괄호·구두점 제거, 회사 형태 표기((주)·㈜·주식회사 등)는 빼서 "아동"이 "(주)아동파크"의 앞부분으로 맞게 */
const norm = (s: string) => s.toLowerCase().replace(/\((주|유|사|재)\)|㈜|주식회사|유한회사/g, "").replace(/[\s()（）\-_.·,]/g, "");

/** query 의 글자마다: 자음이면 초성 비교, 아니면 같은 글자 — text 안에서 연속으로 맞는 첫 위치(없으면 -1) */
function mixedIndex(text: string[], query: string[]): number {
  outer: for (let i = 0; i + query.length <= text.length; i++) {
    for (let j = 0; j < query.length; j++) {
      const t = text[i + j];
      const q = query[j];
      if (!(t === q || (isJamo(q) && choOf(t) === q))) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * 검색 점수(0 = 불일치). 클수록 위로.
 * 글자 그대로 앞부분 일치 100 > 글자 포함 80 > 초성·섞어 쓰기 앞부분 70 > 초성·섞어 쓰기 포함 60 > 보조 텍스트(사업자번호 등) 포함 40.
 * 같은 단계 안에서는 더 앞에서 맞을수록 조금 높다.
 */
export function matchScore(label: string, query: string, extra = ""): number {
  const q = norm(query);
  if (!q) return 1;
  const t = norm(label);
  if (t.startsWith(q)) return 100;
  const at = t.indexOf(q);
  if (at >= 0) return 80 - Math.min(at, 9);
  const mi = mixedIndex(Array.from(t), Array.from(q));
  if (mi === 0) return 70;
  if (mi > 0) return 60 - Math.min(mi, 9);
  if (extra && norm(extra).includes(q)) return 40;
  return 0;
}
