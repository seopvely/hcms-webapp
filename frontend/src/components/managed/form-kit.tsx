"use client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 작성 화면 구역 — 제목·설명 + 내용. collapsible 이면 머리를 눌러 접는다. */
export function FormSection({
  title, description, children, collapsible, defaultOpen = true, aside, className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  aside?: React.ReactNode; // 머리 오른쪽(버튼 등)
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {aside}
      {collapsible && <ChevronDown className={cn("mt-0.5 h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />}
    </div>
  );
  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardContent className="space-y-4 p-5">
        {collapsible ? <button type="button" className="block w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{head}</button> : head}
        {(!collapsible || open) && children}
      </CardContent>
    </Card>
  );
}

/** 금액 입력 — 쉼표로 보여 주고 숫자 문자열(쉼표 없음)로 돌려준다. */
export function MoneyInput({
  value, onChange, className, placeholder, suffix = "원", ...rest
}: {
  value: string;
  onChange: (digits: string) => void;
  className?: string;
  placeholder?: string;
  suffix?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const shown = value === "" || value === "-" ? value : Number(value).toLocaleString("ko-KR");
  return (
    <div className="relative">
      <Input
        {...rest}
        inputMode="numeric"
        className={cn("rounded-xl pr-8 text-right tabular-nums", className)}
        placeholder={placeholder}
        value={Number.isNaN(Number(value)) ? value : shown}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, "");
          onChange(raw.replace(/(?!^)-/g, ""));
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** 저장하지 않은 변경이 있으면 새로고침·닫기 전에 브라우저가 묻게 한다. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

/** 요약 패널의 한 줄 */
export function SummaryRow({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", strong && "border-t pt-2 text-base font-bold")}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", tone)}>{value}</span>
    </div>
  );
}
