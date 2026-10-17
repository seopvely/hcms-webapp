"use client";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchScore } from "@/lib/hangul";
import { cn } from "@/lib/utils";

export type SearchItem = {
  value: string;
  label: string;
  /** 오른쪽 보조 글(사업자번호 등) — 검색에도 쓰인다 */
  sub?: string;
  /** 묶음 이름(검색어가 없을 때 머리글, 검색 중에는 꼬리표) */
  group?: string;
  /** 같은 점수일 때 큰 값이 위(사용 횟수 등). 없으면 원래 순서 */
  rank?: number;
  /** 오른쪽 끝 작은 글(“23회” 등) */
  hint?: string;
};

const MAX_SHOWN = 80;

/** 업체 목록(/lookup/companies) → 검색 항목 */
export function toCompanyItems(list: { id: number; name: string; business_number?: string }[] | undefined): SearchItem[] {
  return (list ?? []).map((c) => ({ value: String(c.id), label: c.name, sub: c.business_number || undefined }));
}

/** [값, 이름] 목록(FormGrid options 등) → 검색 항목 */
export function toPairItems(pairs: [string, string][] | undefined): SearchItem[] {
  return (pairs ?? []).map(([value, label]) => ({ value, label }));
}

/**
 * 검색되는 선택 상자 — 초성(ㅌㅆ)·글자(투썸)·섞어 쓰기(투ㅆ)·보조 글(사업자번호 숫자) 검색, 일치 정도 → rank 순 정렬.
 * ↑↓ 로 고르고 Enter 로 선택, Esc 로 닫는다.
 */
export function SearchSelect({
  items, value, onChange, placeholder = "선택", searchPlaceholder = "검색 (초성 가능)", className, disabled, emptyOption,
}: {
  items: SearchItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  /** 맨 위 "선택 안 함" 항목 이름(전체·없음 등) — 값은 "" 이고 검색 중에는 숨긴다 */
  emptyOption?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.value === value) ?? (emptyOption && !value ? { value: "", label: emptyOption } as SearchItem : undefined);

  const shown = useMemo(() => {
    if (!q.trim()) return [...(emptyOption ? [{ value: "", label: emptyOption }] : []), ...items.slice(0, MAX_SHOWN * 4)];
    return items
      .map((it, idx) => ({ it, idx, s: matchScore(it.label, q, it.sub) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.it.rank ?? 0) - (a.it.rank ?? 0) || a.idx - b.idx)
      .slice(0, MAX_SHOWN)
      .map((x) => x.it);
  }, [items, q, emptyOption]);

  const pick = (it: SearchItem | undefined) => {
    if (!it) return;
    onChange(it.value);
    setOpen(false);
    setQ("");
  };
  const move = (d: number) => {
    const next = Math.max(0, Math.min(shown.length - 1, active + d));
    setActive(next);
    listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const searching = !!q.trim();

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); setActive(0); }}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} data-search-select
          className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-sm disabled:opacity-50", className)}>
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? <>{selected.label}{selected.sub && <span className="ml-1 text-muted-foreground">({selected.sub})</span>}</> : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input autoFocus className="h-10 border-0 px-0 shadow-none focus-visible:ring-0" placeholder={searchPlaceholder} value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); listRef.current?.scrollTo({ top: 0 }); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
              else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
              else if (e.key === "Enter") { e.preventDefault(); pick(shown[active]); }
            }} />
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">검색 결과가 없습니다</p>}
          {shown.map((it, i) => (
            <div key={it.value || "__empty"}>
              {!searching && it.group && it.group !== shown[i - 1]?.group && (
                <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">{it.group}</p>
              )}
              <button type="button" data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => pick(it)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", i === active && "bg-muted")}>
                <Check className={cn("h-3.5 w-3.5 shrink-0", it.value === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1 truncate">
                  {it.label}{it.sub && <span className="ml-1 text-xs text-muted-foreground">{it.sub}</span>}
                </span>
                {searching && it.group && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{it.group}</span>}
                {it.hint && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{it.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
