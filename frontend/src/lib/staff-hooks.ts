import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";

export interface StaffMe {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  is_admin: boolean;
  two_factor_enabled: boolean;
}

export const fetchStaffMe = async (): Promise<StaffMe> => {
  const { data } = await staffApi.get("/managed/me");
  return data;
};

export function useStaffMe() {
  return useQuery({
    queryKey: ["staff", "me"],
    queryFn: fetchStaffMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

// ── 대시보드 ──
export interface StaffDashboard {
  projects_in_progress: number;
  projects_total: number;
  active_customers: number;
  maintenance_in_progress: number;
  maintenance_new: number;
  inquiries_waiting: number;
  completed_30d: number;
  maint_renewal_pending: number;
}

export function useStaffDashboard() {
  return useQuery({
    queryKey: ["staff", "dashboard"],
    queryFn: async (): Promise<StaffDashboard> => (await staffApi.get("/managed/dashboard")).data,
  });
}

// ── 고객 계정(대리 로그인) ──
export interface CustomerAccount {
  seq: number;
  login_id: string;
  name: string | null;
  company_id: number | null;
  company_name: string | null;
  login_permit_tf: string | null;
  last_login: string | null;
}

export function useCustomerAccounts(q: string) {
  return useQuery({
    queryKey: ["staff", "customers", "list", { q }],
    queryFn: async (): Promise<{ items: CustomerAccount[]; total: number }> =>
      (await staffApi.get("/managed/customers", { params: q ? { q } : undefined })).data,
  });
}

export async function impersonate(managerSeq: number): Promise<{ access_token: string }> {
  return (await staffApi.post("/managed/impersonate", { manager_seq: managerSeq })).data;
}

// ── 직원 계정 관리(관리자) ──
export interface StaffAccount {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  department: string | null;
  position: string | null;
  previlege: string | null;
  is_superuser: boolean;
  is_admin: boolean;
  is_active: boolean;
  two_factor_enabled: boolean;
  totp_registered: boolean;
  last_login: string | null;
}

export type StaffAccountUpdate = Partial<
  Pick<StaffAccount, "name" | "email" | "phone_number" | "department" | "position" | "previlege" | "is_active" | "two_factor_enabled">
>;

export function useStaffAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "accounts", "list"],
    queryFn: async (): Promise<{ items: StaffAccount[]; total: number }> => (await staffApi.get("/managed/staff")).data,
    enabled,
  });
}

export function useUpdateStaffAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: StaffAccountUpdate }) =>
      (await staffApi.patch(`/managed/staff/${id}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "accounts"] }),
  });
}

export function useResetStaffTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await staffApi.post(`/managed/staff/${id}/totp-reset`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "accounts"] }),
  });
}

export function useSetStaffPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) =>
      (await staffApi.post(`/managed/staff/${id}/password`, { password })).data,
  });
}
