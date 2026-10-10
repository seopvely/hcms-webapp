// 직원 업체·고객 계정 / 최신소식 / 프로젝트구축진행 API 훅
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";
import type { Paged } from "@/lib/staff-maintenance";

const multipart = { headers: { "Content-Type": "multipart/form-data" } };

// ── 업체·고객 계정 ──
export interface CustomerManager {
  seq: number;
  login_id: string | null;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  mobile_number: string | null;
  position: string | null;
  department: string | null;
  login_permit_tf: string | null;
  login_attempt_count: number;
  is_first_login: boolean;
  has_password: boolean;
  last_login: string | null;
}

export interface AccountCompany {
  seq: number;
  name: string | null;
  ceoname: string | null;
  phone_number: string | null;
  managers: CustomerManager[];
}

export interface CompanyDetail extends Record<string, unknown> {
  seq: number;
  name: string | null;
  managers: CustomerManager[];
  write_enabled: boolean;
}

export function useAccounts(q: string) {
  return useQuery({
    queryKey: ["staff", "accounts", "list", { q }],
    queryFn: async (): Promise<Paged<AccountCompany> & { write_enabled: boolean }> =>
      (await staffApi.get("/managed/accounts", { params: q ? { q } : undefined })).data,
  });
}

export function useAccount(id: number) {
  return useQuery({
    queryKey: ["staff", "accounts", "detail", id],
    queryFn: async (): Promise<CompanyDetail> => (await staffApi.get(`/managed/accounts/${id}`)).data,
  });
}

export function useAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ method, url, body }: { method: "post" | "patch"; url: string; body?: object }) =>
      (await staffApi[method](`/managed/accounts${url}`, body ?? {})).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "accounts"] }),
  });
}

// ── 최신소식 ──
export interface NewsItem {
  seq: number;
  title: string | null;
  category: string | null;
  category_label: string | null;
  is_published: boolean;
  views: number;
  company_ids: number[];
  company_names: string[];
  has_attachment: boolean;
  created_at: string | null;
  summary?: string;
  content?: string;
}

export function useStaffNews(page: number) {
  return useQuery({
    queryKey: ["staff", "news", "list", page],
    queryFn: async (): Promise<Paged<NewsItem> & { write_enabled: boolean }> => (await staffApi.get("/managed/news", { params: { page } })).data,
  });
}

export function useStaffNewsDetail(id: number | null) {
  return useQuery({
    queryKey: ["staff", "news", "detail", id],
    queryFn: async (): Promise<NewsItem & { write_enabled: boolean }> => (await staffApi.get(`/managed/news/${id}`)).data,
    enabled: !!id,
  });
}

export function useNewsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ url, body }: { url: string; body: FormData | object }) =>
      (await staffApi.post(`/managed/news${url}`, body, body instanceof FormData ? multipart : undefined)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "news"] }),
  });
}

// ── 프로젝트구축진행 ──
export interface BoardFile {
  id: number;
  filename: string;
  url: string;
}

export interface BoardComment {
  seq: number;
  parent_id: number | null;
  writer_name: string;
  is_staff: boolean;
  writer_id: number | null;
  content: string;
  created_at: string | null;
  attachments: BoardFile[];
}

export interface BoardPost {
  seq: number;
  parent_id: number | null;
  title: string | null;
  content: string;
  writer_name: string;
  is_staff: boolean;
  writer_id: number | null;
  status: string | null;
  status_label: string;
  is_notice: boolean;
  created_at: string | null;
  categories: string[];
  attachments: BoardFile[];
  comments: BoardComment[];
}

export interface BoardListItem {
  seq: number;
  title: string | null;
  company_name: string | null;
  project_id: number;
  project_title: string | null;
  writer_name: string;
  is_staff: boolean;
  status: string | null;
  status_label: string;
  is_notice: boolean;
  reply_count: number;
  comment_count: number;
  created_at: string | null;
}

export function useStaffBoard(params: { project_id?: number; status?: string; page: number }) {
  return useQuery({
    queryKey: ["staff", "board", "list", params],
    queryFn: async (): Promise<Paged<BoardListItem> & { write_enabled: boolean }> => (await staffApi.get("/managed/project-board", { params })).data,
  });
}

export function useStaffBoardPost(id: number) {
  return useQuery({
    queryKey: ["staff", "board", "detail", id],
    queryFn: async (): Promise<BoardPost & { company_name: string | null; project_id: number; project_title: string | null; replies: BoardPost[]; write_enabled: boolean }> =>
      (await staffApi.get(`/managed/project-board/${id}`)).data,
  });
}

export function useBoardProjects() {
  return useQuery({
    queryKey: ["staff", "board", "projects"],
    queryFn: async (): Promise<{ items: { id: number; name: string }[] }> => (await staffApi.get("/managed/project-board/projects")).data,
  });
}

export function useBoardCategories(projectId?: number) {
  return useQuery({
    queryKey: ["staff", "board", "categories", projectId],
    queryFn: async (): Promise<{ items: { id: number; name: string }[] }> => (await staffApi.get(`/managed/project-board/categories/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useBoardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ url, body }: { url: string; body: FormData | object }) =>
      (await staffApi.post(`/managed/project-board${url}`, body, body instanceof FormData ? multipart : undefined)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "board"] }),
  });
}
