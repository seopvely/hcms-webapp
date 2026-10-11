"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // 4xx(없음·권한)는 다시 시도해도 같으므로 바로 오류 화면으로
            retry: (count, err) => {
              const status = (err as { response?: { status?: number } })?.response?.status;
              return !(status && status >= 400 && status < 500) && count < 1;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
