"use client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { chosung, matchScore } from "@/lib/hangul";
import { cn } from "@/lib/utils";
import type { MemoProject } from "@/lib/staff-memos";

const INITIALS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "A-Z", "0-9"];
const DOUBLE: Record<string, string> = { ㄲ: "ㄱ", ㄸ: "ㄷ", ㅃ: "ㅂ", ㅆ: "ㅅ", ㅉ: "ㅈ" };

/** 색인 글자 — 앞의 연도·괄호·기호는 건너뛰고("2026 숙명여대" → ㅅ) 첫 글자의 초성. 글자가 없으면 숫자 */
function initialOf(title: string): string {
  const ch = title.replace(/^[\s\d()[\]{}<>\-_.·,/#~!@&*+|'"]+/, "").charAt(0);
  if (!ch) return /\d/.test(title) ? "0-9" : "";
  const c = chosung(ch);
  if (c >= "ㄱ" && c <= "ㅎ") return DOUBLE[c] ?? c;
  if (/[a-z]/i.test(ch)) return "A-Z";
  return "";
}

/** 프로젝트메모 목록 왼쪽 — 메모가 연결된 프로젝트를 초성 칩·초성 검색으로 거르고 골라서 메모를 본다 */
export function MemoProjectIndex({ projects, unlinked, total, value, onChange }: {
  projects: MemoProject[];
  unlinked: number;
  total: number;
  /** "" = 전체, "unlinked" = 미연동, 그 밖 = 프로젝트 seq */
  value: string;
  onChange: (v: string) => void;
}) {
  const [initial, setInitial] = useState("");
  const [q, setQ] = useState("");
  const withInitial = useMemo(() => projects.map((p) => ({ ...p, initial: initialOf(p.title) })), [projects]);
  const available = useMemo(() => new Set(withInitial.map((p) => p.initial)), [withInitial]);
  const shown = useMemo(() => {
    let list = initial ? withInitial.filter((p) => p.initial === initial) : withInitial;
    if (q.trim()) {
      list = list
        .map((p) => ({ p, s: Math.max(matchScore(p.title, q), matchScore(p.company_name ?? "", q) * 0.9) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p);
    }
    return list;
  }, [withInitial, initial, q]);

  const row = (key: string, label: React.ReactNode, sub: string | null, n: number) => (
    <button key={key} type="button" onClick={() => onChange(key)}
      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm", value === key ? "bg-slate-900 text-white" : "hover:bg-muted")}>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className={cn("block truncate text-[11px]", value === key ? "text-white/70" : "text-muted-foreground")}>{sub}</span>}
      </span>
      <span className="shrink-0 text-xs tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <Card className="h-fit rounded-2xl lg:sticky lg:top-20">
      <CardContent className="space-y-2 px-3 pt-4 pb-3">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setInitial("")}
            className={cn("rounded-md border px-1.5 py-0.5 text-xs", !initial ? "border-slate-900 bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted")}>전체</button>
          {INITIALS.map((c) => (
            <button key={c} type="button" disabled={!available.has(c)} onClick={() => setInitial(initial === c ? "" : c)}
              className={cn("min-w-6 rounded-md border px-1.5 py-0.5 text-xs disabled:opacity-30",
                initial === c ? "border-slate-900 bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted")}>
              {c}
            </button>
          ))}
        </div>
        <Input className="h-9 rounded-xl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="프로젝트·업체 검색 (초성 가능)" />
        <div className="max-h-72 space-y-0.5 overflow-y-auto lg:max-h-[calc(100vh-18rem)]">
          {!initial && !q.trim() && row("", "전체 메모", null, total)}
          {!initial && !q.trim() && unlinked > 0 && row("unlinked", "미연동 메모", null, unlinked)}
          {shown.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">맞는 프로젝트가 없습니다.</p>
          ) : (
            shown.map((p) => row(String(p.seq), p.title, p.company_name, p.count))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
