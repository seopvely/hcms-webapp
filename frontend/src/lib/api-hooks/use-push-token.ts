import { useMutation } from "@tanstack/react-query";
import api from "@/lib/axios";

interface RegisterPushTokenParams {
  token: string;
  platform: "ios" | "android";
  device_id?: string;
}

export function useRegisterPushToken() {
  return useMutation({
    mutationFn: (params: RegisterPushTokenParams) =>
      api.post("/push/register", params),
  });
}

export function useUnregisterPushToken() {
  return useMutation({
    mutationFn: (token: string) =>
      api.delete("/push/unregister", { data: { token } }),
  });
}

