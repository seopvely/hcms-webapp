// 직원 견적·계약·영업접수 API 훅
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";
import type { Paged } from "@/lib/staff-maintenance";

type Dict = Record<string, unknown>;

export interface EstimateListItem {
  seq: number;
  estimate_number: string | null;
  title: string | null;
  company_name: string | null;
  status: string;
  status_label: string;
  withdrawn: boolean;
  total: number;
  manager_name: string | null;
  written_date: string | null;
  validity_period: string | null;
  created_at: string | null;
}

export interface EstimateItemRow {
  seq: number;
  item_order: number;
  category: string | null;
  item_name: string;
  specification: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  is_separate: boolean;
  remarks: string | null;
  total: number;
}

export interface EstimateDetail extends Dict {
  seq: number;
  estimate_title: string | null;
  estimate_number: string | null;
  company_id: number | null;
  company_name: string | null;
  status: string;
  status_label: string;
  withdrawn: boolean;
  manager_name: string | null;
  customer_email_sent: string | null;
  converted_project_id: number | null;
  amounts: { subtotal: number; discount: number; discounted: number; tax: number; total: number };
  items: EstimateItemRow[];
  histories: { previous_status: string | null; new_status: string; by: string | null; reason: string | null; created_at: string | null }[];
  revisions: { seq: number; requester_name: string | null; requester_email: string; title: string; content: string; is_resolved: boolean; resolved_comment: string | null; created_at: string | null }[];
  contracts: { seq: number; contract_number: string | null; status: string; status_label: string }[];
  recipients: { seq: number; name: string | null; email: string }[];
  project_types: Record<string, string>;
  write_enabled: boolean;
}

export function useStaffEstimates(params: { q?: string; status?: string; company_id?: number; sort?: string; page: number }) {
  return useQuery({
    queryKey: ["staff", "estimates", "list", params],
    queryFn: async (): Promise<Paged<EstimateListItem> & { write_enabled: boolean }> => (await staffApi.get("/managed/estimates", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useStaffEstimate(id: number | null) {
  return useQuery({
    queryKey: ["staff", "estimates", "detail", id],
    queryFn: async (): Promise<EstimateDetail> => (await staffApi.get(`/managed/estimates/${id}`)).data,
    enabled: !!id,
  });
}

export function useEstimateDashboard(months: number) {
  return useQuery({
    queryKey: ["staff", "estimates", "dashboard", months],
    queryFn: async () => (await staffApi.get("/managed/estimates/dashboard", { params: { months } })).data as {
      total_count: number; total_amount: number; approval_rate: number | null;
      by_status: { status: string; label: string; count: number; amount: number }[];
      monthly: { month: string; count: number }[];
      top_companies: { name: string; count: number; amount: number }[];
      expiring: { seq: number; title: string; validity_period: string }[];
    },
  });
}

// 견적·계약·영업·전환 공용 변경 훅 — 성공하면 관련 목록을 모두 새로 고친다
export function useSalesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = "post", url, body }: { method?: "post" | "patch"; url: string; body?: Dict | FormData }) =>
      (await staffApi[method](`/managed${url}`, body ?? {}, body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined)).data,
    onSuccess: () => {
      ["estimates", "contracts", "sales", "dashboard"].forEach((k) => queryClient.invalidateQueries({ queryKey: ["staff", k] }));
    },
  });
}

// ── 계약서 ──
export interface ContractListItem {
  seq: number;
  contract_number: string | null;
  contract_title: string | null;
  party_a_name: string | null;
  contract_amount: number | null;
  status: string;
  status_label: string;
  estimate_id: number | null;
  sent_at: string | null;
  customer_signed_at: string | null;
  created_at: string | null;
}

export function useStaffContracts(params: { q?: string; status?: string; sort?: string; page: number }) {
  return useQuery({
    queryKey: ["staff", "contracts", "list", params],
    queryFn: async (): Promise<Paged<ContractListItem> & { stats: { status: string; label: string; count: number }[]; write_enabled: boolean }> =>
      (await staffApi.get("/managed/contracts", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useStaffContract(id: number | null) {
  return useQuery({
    queryKey: ["staff", "contracts", "detail", id],
    queryFn: async () => (await staffApi.get(`/managed/contracts/${id}`)).data as Dict & {
      seq: number; contract_number: string; status: string; status_label: string; token_valid: boolean;
      estimate: { seq: number; number: string; status: string; converted_project_id: number | null } | null;
      recipients: { seq: number; name: string | null; email: string }[];
      histories: { action: string; by: string | null; description: string | null; ip: string | null; created_at: string | null }[];
      has_signed_pdf: boolean; write_enabled: boolean;
    },
    enabled: !!id,
  });
}

export function useContractPrefill(estimateId: number | null) {
  return useQuery({
    queryKey: ["staff", "contracts", "prefill", estimateId],
    queryFn: async () => (await staffApi.get("/managed/contracts/prefill", { params: { estimate_id: estimateId } })).data as Dict,
    enabled: !!estimateId,
  });
}

export function useWithdrawInfo(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "contracts", "withdraw-info", id],
    queryFn: async () => (await staffApi.get(`/managed/contracts/${id}/withdraw-info`)).data as {
      project_id: number | null; project_title?: string; payment_count?: number; paid_payment_count?: number;
      point_count?: number; point_total?: number; blockers?: Record<string, number>; can_delete_project?: boolean;
    },
    enabled,
  });
}

// ── 영업접수 ──
export interface LeadListItem {
  seq: number;
  title: string;
  client_company: string;
  client_name: string;
  status: string;
  status_label: string;
  source_label: string;
  priority: string;
  priority_label: string;
  expected_amount: number;
  expected_close_date: string | null;
  manager_name: string | null;
  estimate_id: number | null;
  created_at: string | null;
}

export interface SalesChoices {
  status: Record<string, string>;
  source: Record<string, string>;
  priority: Record<string, string>;
  activity: Record<string, string>;
}

export function useStaffLeads(params: { q?: string; status?: string; source?: string; drafts?: boolean; sort?: string; page: number }) {
  return useQuery({
    queryKey: ["staff", "sales", "list", params],
    queryFn: async (): Promise<Paged<LeadListItem> & { pipeline: { status: string; label: string; count: number }[]; draft_count: number; choices: SalesChoices; write_enabled: boolean }> =>
      (await staffApi.get("/managed/sales", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useStaffLead(id: number | null) {
  return useQuery({
    queryKey: ["staff", "sales", "detail", id],
    queryFn: async () => (await staffApi.get(`/managed/sales/${id}`)).data as Dict & {
      seq: number; title: string; status: string; status_label: string; source_label: string; priority_label: string;
      client_company: string; client_name: string; client_phone: string; client_email: string; client_position: string;
      description: string; notes: string; expected_amount: number; expected_close_date: string | null; manager_name: string | null;
      company_name: string | null; estimate: { seq: number; number: string; status: string } | null; projects: { seq: number; title: string }[];
      activities: { seq: number; type: string; type_label: string; content: string; by: string | null; by_id: number | null; created_at: string | null; attachments: { id: number; filename: string }[] }[];
      choices: SalesChoices; write_enabled: boolean;
    },
    enabled: !!id,
  });
}

export function useStaffList() {
  return useQuery({
    queryKey: ["staff", "accounts", "list-simple"],
    queryFn: async (): Promise<{ items: { id: number; name: string | null; username: string }[] }> => {
      try {
        return (await staffApi.get("/managed/staff")).data;
      } catch {
        return { items: [] };
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}
