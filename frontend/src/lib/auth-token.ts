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
