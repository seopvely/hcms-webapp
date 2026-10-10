// 직원 유지보수·포인트 API 훅 (/api/managed/maintenance, /points, /comment-templates, /lookup)
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface Option {
  id: number;
  name: string;
}

export const staffFileUrl = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/managed${path}`;

// ── 선택 목록 ──
export function useLookupCompanies() {
  return useQuery({
    queryKey: ["staff", "lookup", "companies"],
    queryFn: async (): Promise<{ items: Option[] }> => (await staffApi.get("/managed/lookup/companies")).data,
    staleTime: 10 * 60 * 1000,
  });
}

export function useLookupProjects(companyId?: number) {
  return useQuery({
    queryKey: ["staff", "lookup", "projects", { companyId }],
    queryFn: async (): Promise<{ items: Option[] }> =>
      (await staffApi.get("/managed/lookup/projects", { params: companyId ? { company_id: companyId } : undefined })).data,
    staleTime: 10 * 60 * 1000,
  });
}

export function useLookupManagers(companyId?: number) {
  return useQuery({
    queryKey: ["staff", "lookup", "managers", { companyId }],
    queryFn: async (): Promise<{ items: Option[] }> =>
      (await staffApi.get("/managed/lookup/managers", { params: { company_id: companyId } })).data,
    enabled: !!companyId,
  });
}

// ── 유지보수 요청 ──
export interface MaintListItem {
  seq: number;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
  project_id: number | null;
  project_title: string | null;
  writer_name: string | null;
  request_date: string | null;
  completion_date: string | null;
  status: string | null;
  status_label: string;
  request_type: string | null;
  is_free_maint: boolean;
  points_used: number;
  pending_points: number;
  comment_count: number;
}

export interface MaintListParams {
  company_id?: number;
  project_id?: number;
  status?: string;
  request_type?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export function useStaffMaintenanceList(params: MaintListParams) {
  return useQuery({
    queryKey: ["staff", "maintenance", "list", params],
    queryFn: async (): Promise<Paged<MaintListItem>> => (await staffApi.get("/managed/maintenance", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export interface FileRef {
  id: number;
  filename: string;
}

export interface MaintComment {
  seq: number;
  parent_id: number | null;
  writer_id: number | null;
  writer_name: string;
  is_customer: boolean;
  worker_type_label: string | null;
  status: string | null;
  status_label: string | null;
  content: string;
  point: number;
  point_executed: boolean;
  completion_date: string | null;
  created_at: string | null;
  attachments: FileRef[];
  legacy_file: string | null;
}

export interface MaintDetail {
  seq: number;
  title: string | null;
  contents: string;
  company_id: number | null;
  company_name: string | null;
  project_id: number | null;
  project_title: string | null;
  writer_name: string | null;
  writer_email: string | null;
  request_date: string | null;
  completion_date: string | null;
  complete_date: string | null;
  created_at: string | null;
  status: string | null;
  status_label: string;
  request_type: string | null;
  request_type_label: string;
  is_free_maint: boolean;
  points_used: number;
  points_used_ledger: number;
  remaining_points: number | null;
  monthly_point: number | null;
  attachments: FileRef[];
  legacy_file: string | null;
  comments: MaintComment[];
  point_histories: { seq: number; point: number; point_type_label: string; status_label: string; comment_id: number | null; created_at: string | null }[];
  write_enabled: boolean;
}

export function useStaffMaintenanceDetail(id: number) {
  return useQuery({
    queryKey: ["staff", "maintenance", "detail", id],
    queryFn: async (): Promise<MaintDetail> => (await staffApi.get(`/managed/maintenance/${id}`)).data,
    enabled: !!id,
  });
}

export interface PendingPoint {
  comment_id: number;
  managelist_id: number;
  title: string | null;
  company_name: string | null;
  point: number;
  writer_name: string | null;
  created_at: string | null;
  summary: string;
}

export function usePendingPoints(params: { company_id?: number; project_id?: number }, enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "maintenance", "pending-points", params],
    queryFn: async (): Promise<{ items: PendingPoint[] }> =>
      (await staffApi.get("/managed/maintenance/pending-points", { params })).data,
    enabled,
  });
}

export interface ScheduleEvent {
  id: number;
  title: string | null;
  start: string;
  end: string;
  status: string | null;
  status_label: string;
  company_name: string | null;
  project_title: string | null;
  writer_name: string | null;
}

export function useMaintenanceSchedule(start: string, end: string) {
  return useQuery({
    queryKey: ["staff", "maintenance", "schedule", { start, end }],
    queryFn: async (): Promise<{ items: ScheduleEvent[] }> =>
      (await staffApi.get("/managed/maintenance/schedule", { params: { start, end } })).data,
  });
}

export interface CommentSearchItem {
  comment_id: number;
  managelist_id: number;
  title: string | null;
  company_name: string | null;
  writer_name: string | null;
  worker_type_label: string | null;
  status_label: string | null;
  point: number;
  point_executed: boolean;
  created_at: string | null;
  summary: string;
}

export function useCommentSearch(params: { q?: string; worker_type?: string; date_from?: string; date_to?: string; page?: number }) {
  return useQuery({
    queryKey: ["staff", "maintenance", "comments", params],
    queryFn: async (): Promise<Paged<CommentSearchItem>> =>
      (await staffApi.get("/managed/maintenance/comments", { params })).data,
    placeholderData: keepPreviousData,
  });
}

function useInvalidateMaintenance() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["staff", "maintenance"] });
    queryClient.invalidateQueries({ queryKey: ["staff", "points"] });
    queryClient.invalidateQueries({ queryKey: ["staff", "dashboard"] });
  };
}

const multipart = { headers: { "Content-Type": "multipart/form-data" } };

export function useCreateStaffMaintenance() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: async (form: FormData): Promise<{ seq: number }> => (await staffApi.post("/managed/maintenance", form, multipart)).data,
    onSuccess: invalidate,
  });
}

export function useAddStaffComment(id: number) {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: async (form: FormData) => (await staffApi.post(`/managed/maintenance/${id}/comments`, form, multipart)).data,
    onSuccess: invalidate,
  });
}

export function useMaintenanceAction() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: async ({ url, body }: { url: string; body?: object }) => (await staffApi.post(`/managed/maintenance${url}`, body ?? {})).data,
    onSuccess: invalidate,
  });
}

export function useExecutePoints() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: async (body: { comment_ids: number[]; password: string }): Promise<{ executed: number[]; skipped: number[] }> =>
      (await staffApi.post("/managed/maintenance/points/execute", body)).data,
    onSuccess: invalidate,
  });
}

// ── 처리내역 템플릿 ──
export interface CommentTemplate {
  seq: number;
  name: string;
  content: string;
  worker_type: string | null;
  usage_count: number;
}

export function useCommentTemplates() {
  return useQuery({
    queryKey: ["staff", "comment-templates"],
    queryFn: async (): Promise<{ items: CommentTemplate[] }> => (await staffApi.get("/managed/comment-templates")).data,
  });
}

export function useSaveCommentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ seq, ...body }: { seq?: number; name: string; content: string }) =>
      seq
        ? (await staffApi.patch(`/managed/comment-templates/${seq}`, body)).data
        : (await staffApi.post("/managed/comment-templates", body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "comment-templates"] }),
  });
}

export function useDeleteCommentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (seq: number) => (await staffApi.post(`/managed/comment-templates/${seq}/delete`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "comment-templates"] }),
  });
}

// ── 포인트 장부 ──
export interface LedgerItem {
  seq: number;
  company_name: string | null;
  project_id: number | null;
  project_title: string | null;
  managelist_id: number | null;
  point: number;
  point_type: string | null;
  point_type_label: string;
  status_label: string;
  category: string;
  content: string | null;
  edit_reason: string | null;
  writer_name: string | null;
  created_at: string | null;
}

export function usePointLedger(params: { company_id?: number; project_id?: number; point_type?: string; page?: number }) {
  return useQuery({
    queryKey: ["staff", "points", "ledger", params],
    queryFn: async (): Promise<Paged<LedgerItem>> => (await staffApi.get("/managed/points", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export interface ProjectBalance {
  project_id: number;
  project_title: string | null;
  company_name: string | null;
  monthly_point: number;
  cycle_start: string | null;
  cycle_end: string | null;
  cycle_total: number;
  remaining: number;
}

export function useProjectBalances() {
  return useQuery({
    queryKey: ["staff", "points", "projects"],
    queryFn: async (): Promise<{ items: ProjectBalance[] }> => (await staffApi.get("/managed/points/projects")).data,
  });
}

export function useAdjustPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { project_id: number; point_type: string; points: number; reason: string; password: string }) =>
      (await staffApi.post("/managed/points/adjust", body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "points"] }),
  });
}
