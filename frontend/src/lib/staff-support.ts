// 직원 고객문의·건별작업 API 훅
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";
import type { FileRef, Paged } from "@/lib/staff-maintenance";

export interface InquiryListItem {
  seq: number;
  title: string | null;
  company_name: string | null;
  writer_name: string | null;
  inquiry_type_label: string;
  status: string | null;
  status_label: string;
  created_at: string | null;
  answered_at: string | null;
  answer_count: number;
  customer_replied_last: boolean;
}

export interface InquiryDetail {
  seq: number;
  title: string | null;
  contents: string;
  company_name: string | null;
  writer_name: string | null;
  writer_email: string | null;
  inquiry_type_label: string;
  status: string | null;
  status_label: string;
  created_at: string | null;
  answered_at: string | null;
  attachments: FileRef[];
  has_legacy_file: boolean;
  answers: { seq: number; parent_answer_id: number | null; is_staff: boolean; writer_name: string | null; content: string; has_file: boolean; created_at: string | null }[];
  write_enabled: boolean;
}

export type SimpleListParams = { company_id?: number; status?: string; task_type?: string; q?: string; sort?: string; page: number };

export function useStaffInquiries(params: SimpleListParams) {
  return useQuery({
    queryKey: ["staff", "inquiries", "list", params],
    queryFn: async (): Promise<Paged<InquiryListItem>> => (await staffApi.get("/managed/inquiries", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useStaffInquiry(id: number) {
  return useQuery({
    queryKey: ["staff", "inquiries", "detail", id],
    queryFn: async (): Promise<InquiryDetail> => (await staffApi.get(`/managed/inquiries/${id}`)).data,
  });
}

export function useAnswerInquiry(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) =>
      (await staffApi.post(`/managed/inquiries/${id}/answers`, form, { headers: { "Content-Type": "multipart/form-data" } })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "inquiries"] }),
  });
}

export interface TaskListItem {
  seq: number;
  title: string | null;
  company_name: string | null;
  writer_name: string | null;
  task_type_label: string;
  status: string | null;
  status_label: string;
  request_date: string | null;
  deadline: string | null;
  work_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  created_at: string | null;
}

export interface TaskDetail extends TaskListItem {
  content: string;
  company_id: number | null;
  project_id: number | null;
  project_title: string | null;
  task_type: string | null;
  work_started_at: string | null;
  budget: number | null;
  file_name: string | null;
  comments: { seq: number; writer_name: string; content: string; created_at: string | null }[];
  write_enabled: boolean;
}

export function useStaffTasks(params: SimpleListParams) {
  return useQuery({
    queryKey: ["staff", "tasks", "list", params],
    queryFn: async (): Promise<Paged<TaskListItem>> => (await staffApi.get("/managed/tasks", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useStaffTask(id: number) {
  return useQuery({
    queryKey: ["staff", "tasks", "detail", id],
    queryFn: async (): Promise<TaskDetail> => (await staffApi.get(`/managed/tasks/${id}`)).data,
  });
}

export function useTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ method, url, body }: { method: "post" | "patch"; url: string; body: object | FormData }) =>
      (await staffApi[method](`/managed/tasks${url}`, body, body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "tasks"] }),
  });
}
