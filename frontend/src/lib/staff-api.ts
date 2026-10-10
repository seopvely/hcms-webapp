import axios from "axios";

// 직원 API 전용 인스턴스. 인증은 httpOnly 세션 쿠키(hcms_staff_session)로 하고,
// 상태를 바꾸는 요청에는 hcms_staff_csrf 쿠키 값을 X-CSRF-Token 헤더로 보낸다.
const staffApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

staffApi.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("hcms_staff_csrf");
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

staffApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const isAuthRequest = error.config?.url?.includes("/auth/");
      if (!isAuthRequest) {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
      }
    }
    return Promise.reject(error);
  }
);

/** 로그인 후 이동할 직원 경로. /managed 밖으로는 보내지 않는다(오픈 리다이렉트 방지). */
export function safeStaffNext(next: string | null): string {
  if (next && /^\/managed(\/|$|\?)/.test(next)) return next;
  return "/managed";
}

export default staffApi;
