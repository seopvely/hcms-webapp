import { useQuery } from "@tanstack/react-query";
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
