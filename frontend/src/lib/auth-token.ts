// 고객 access 토큰 조회. 직원 대리 로그인 탭은 sessionStorage 의 토큰을 우선 쓴다
// (탭 단위로만 유지 — 직원 브라우저의 다른 탭·고객 본인 로그인과 섞이지 않게).
export const IMPERSONATION_TOKEN_KEY = "impersonation_token";

export function getImpersonationToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(IMPERSONATION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return getImpersonationToken() || localStorage.getItem("access_token");
}

export function clearImpersonation(): void {
  try {
    sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
  } catch {
    // sessionStorage 를 쓸 수 없는 환경
  }
}

export interface ImpersonationInfo {
  staffName: string;
  expiresAt: number; // epoch ms
}

/** 대리 로그인 토큰이면 직원 이름·만료 시각을 돌려준다(서명 검증은 서버가 한다). */
export function getImpersonationInfo(): ImpersonationInfo | null {
  const token = getImpersonationToken();
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    const payload = JSON.parse(json);
    if (!payload.act) return null;
    return { staffName: payload.act.name || "직원", expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

// 메일 링크(견적·계약)로 들어온 고객용 문서 토큰 — 견적 1건만 볼 수 있고 탭이 닫히면 사라진다.
export const DOCUMENT_TOKEN_KEY = "document_token";

export interface DocumentToken {
  estimateId: number;
  token: string;
}

function tokenExpired(token: string): boolean {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

/** 만료된 문서 토큰은 없는 것으로 본다(로그인한 고객이 같은 탭에서 나중에 그 견적을 열 때 세션을 지우지 않게). */
export function getDocumentToken(): DocumentToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DOCUMENT_TOKEN_KEY);
    const doc = raw ? (JSON.parse(raw) as DocumentToken) : null;
    if (doc && tokenExpired(doc.token)) {
      sessionStorage.removeItem(DOCUMENT_TOKEN_KEY);
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}

export function setDocumentToken(estimateId: number, token: string): void {
  try {
    sessionStorage.setItem(DOCUMENT_TOKEN_KEY, JSON.stringify({ estimateId, token }));
  } catch {
    // sessionStorage 를 쓸 수 없는 환경
  }
}

export function clearDocumentToken(): void {
  try {
    sessionStorage.removeItem(DOCUMENT_TOKEN_KEY);
  } catch {
    // sessionStorage 를 쓸 수 없는 환경
  }
}

/** 이 경로(견적 상세 화면 또는 견적 API)가 문서 토큰의 견적이면 그 토큰을 돌려준다. */
export function documentTokenFor(path: string | undefined): string | null {
  const doc = getDocumentToken();
  if (!doc || !path) return null;
  const m = path.match(/^\/estimates\/(\d+)(?:[/?]|$)/);
  return m && Number(m[1]) === doc.estimateId ? doc.token : null;
}
