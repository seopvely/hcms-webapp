"use client";
import { useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

// 서버에서 정화한 HTML 을 화면에서도 한 번 더 정화해 표시한다(저장형 XSS 이중 방어).
export function SafeHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  const clean = useMemo(
    () => (typeof window === "undefined" ? "" : DOMPurify.sanitize(html || "", { ADD_ATTR: ["target"] })),
    [html]
  );
  return (
    <div
      className={cn(
        "break-words text-sm leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_table]:border [&_td]:border [&_td]:px-2 [&_ul]:list-disc [&_ul]:pl-5",
        className
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
