import axios from "axios";
import { clearDocumentToken, clearImpersonation, documentTokenFor, getAccessToken, getImpersonationToken } from "@/lib/auth-token";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  // 메일 링크 문서 토큰은 그 견적 API 에만 쓴다(로그인 세션보다 우선 — 다른 회사로 로그인해 있어도 열리게)
  const token = documentTokenFor(config.url) || getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const isLoginRequest = error.config?.url?.includes("/auth/");
      if (!isLoginRequest) {
        if (getImpersonationToken()) {
          // 대리 로그인 토큰 만료 — 이 탭만 정리하고 직원 화면으로
          clearImpersonation();
          window.location.href = "/managed/customers";
          return Promise.reject(error);
        }
        clearDocumentToken();
        localStorage.removeItem("access_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
