"use client";
import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 목록 필터 카드 — 데스크톱은 항상 펼침, 모바일은 접어 두고 "필터" 버튼으로 연다(목록이 첫 화면에 보이게). */
export function FilterCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium sm:hidden"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        검색·필터
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <CardContent className={cn(className, "px-4 pt-0 pb-4 sm:px-5 sm:pt-4", !open && "hidden sm:grid", !open && className?.includes("flex") && "sm:flex")}>
        {children}
      </CardContent>
    </Card>
  );
}
