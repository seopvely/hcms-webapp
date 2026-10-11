"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 정렬 상태 — 서버 정렬이면 API 의 sort 파라미터로 그대로 보낸다("-" 접두 = 내림차순). */
export type SortValue = string | undefined;

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** 정렬 가능하면 정렬 키(서버 정렬 키 또는 클라이언트 비교 값) */
  sort?: string;
  /** 클라이언트 정렬용 값(서버 정렬이 아닐 때) */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string; // 너비 등(td·th 공통)
  /** 좁은 화면(md 미만)에서 숨김 */
  hideOnMobile?: boolean;
}

/**
 * 직원 화면 공용 목록 표.
 * - md 이상: 표(머리글 클릭 정렬, 행 클릭 이동)
 * - md 미만: mobile 렌더러가 있으면 카드 목록, 없으면 hideOnMobile 이 아닌 열만 표로
 * 정렬: sort/onSortChange 를 주면 서버 정렬(부모가 API 다시 조회), 없으면 현재 행을 클라이언트에서 정렬한다.
 */
export function DataTable<T>({
  columns, rows, rowKey, rowHref, onRowClick, sort, onSortChange, mobile, empty, rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  sort?: SortValue;
  onSortChange?: (sort: SortValue) => void;
  mobile?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const router = useRouter();
  const [localSort, setLocalSort] = useState<SortValue>();
  const server = !!onSortChange;
  const current = server ? sort : localSort;
  const desc = current?.startsWith("-");
  const field = current?.replace(/^-/, "");

  const sorted = useMemo(() => {
    if (server || !field) return rows;
    const col = columns.find((c) => c.sort === field);
    if (!col?.value) return rows;
    const v = col.value;
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
      return desc ? -r : r;
    });
  }, [rows, server, field, desc, columns]);

  const toggle = (key: string) => {
    // 오름 → 내림 → 해제
    const next = field !== key ? key : !desc ? `-${key}` : undefined;
    if (server) onSortChange!(next);
    else setLocalSort(next);
  };

  const go = (row: T, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
    if (onRowClick) return onRowClick(row);
    const href = rowHref?.(row);
    if (!href) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
    else router.push(href);
  };
  const clickable = !!(rowHref || onRowClick);
  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  if (sorted.length === 0) return <Card className="rounded-2xl">{empty}</Card>;

  return (
    <Card className="overflow-hidden rounded-2xl">
      {mobile && (
        <ul className="divide-y md:hidden">
          {sorted.map((r) => (
            <li key={rowKey(r)} onClick={(e) => go(r, e)} className={cn("px-4 py-3", clickable && "cursor-pointer active:bg-muted/50", rowClassName?.(r))}>
              {mobile(r)}
            </li>
          ))}
        </ul>
      )}
      <div className={cn("overflow-x-auto", mobile && "hidden md:block")}>
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 font-medium first:pl-4 last:pr-4", alignCls(c.align), c.hideOnMobile && "hidden md:table-cell", c.className)}>
                  {c.sort ? (
                    <button onClick={() => toggle(c.sort!)} className={cn("inline-flex items-center gap-1 hover:text-foreground", field === c.sort && "text-foreground")}>
                      {c.header}
                      {field === c.sort ? (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => (
              <tr key={rowKey(r)} onClick={(e) => go(r, e)} className={cn(clickable && "cursor-pointer hover:bg-muted/40", rowClassName?.(r))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-middle first:pl-4 last:pr-4", alignCls(c.align), c.align === "right" && "tabular-nums", c.hideOnMobile && "hidden md:table-cell", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
