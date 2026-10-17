// 직원 프로젝트·도메인·외주 API 훅
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";
import type { Paged } from "@/lib/staff-maintenance";

type Dict = Record<string, unknown>;
export type ListResult = Paged<Dict> & { write_enabled: boolean; choices?: Record<string, Record<string, string>> };

export function useStaffGet<T = Dict>(key: unknown[], url: string | null, params?: Dict, opts?: { refetchInterval?: (data: T | undefined) => number | false }) {
  return useQuery({
    queryKey: ["staff", ...key, params ?? {}],
    queryFn: async (): Promise<T> => (await staffApi.get(`/managed${url}`, { params })).data,
    enabled: !!url,
    placeholderData: keepPreviousData,
    refetchInterval: opts?.refetchInterval ? (q) => opts.refetchInterval!(q.state.data as T | undefined) : undefined,
  });
}

export function useStaffWrite(invalidate: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = "post", url, body }: { method?: "post" | "patch" | "put"; url: string; body?: Dict | FormData }) =>
      (await staffApi[method](`/managed${url}`, body ?? {}, body instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : undefined)).data,
    onSuccess: () => invalidate.forEach((k) => queryClient.invalidateQueries({ queryKey: ["staff", k] })),
  });
}
