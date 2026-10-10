"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/app-toast";
import { StepUpDialog } from "@/components/managed/step-up-dialog";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { useExecutePoints, usePendingPoints } from "@/lib/staff-maintenance";

// 미실행 책정 포인트 조회 → 선택 일괄 실행(비밀번호 재확인, 서버에서 한 트랜잭션).
export function PendingPointsDialog({
  open,
  onOpenChange,
  filters,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: { company_id?: number; project_id?: number };
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const { data } = usePendingPoints(filters, open);
  const execute = useExecutePoints();
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState(false);
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = items.filter((i) => selected.includes(i.comment_id)).reduce((s, i) => s + i.point, 0);

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = async (password: string) => {
    try {
      const res = await execute.mutateAsync({ comment_ids: selected, password });
      toast("success", `${res.executed.length}건 실행했습니다.${res.skipped.length ? ` (이미 실행 ${res.skipped.length}건 제외)` : ""}`);
      setSelected([]);
      setConfirm(false);
    } catch (err) {
      toast("error", apiErrorDetail(err, "포인트 실행에 실패했습니다."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>포인트 미실행 조회</DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">미실행 책정 포인트가 없습니다.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {items.map((i) => (
              <label key={i.comment_id} className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
                <Checkbox checked={selected.includes(i.comment_id)} disabled={!canWrite} onCheckedChange={() => toggle(i.comment_id)} />
                <div className="min-w-0 flex-1">
                  <Link href={`/managed/maintenance/${i.managelist_id}`} className="font-medium hover:underline">
                    {i.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.company_name} · {i.writer_name} · {fmtDate(i.created_at)} · {i.summary}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">{i.point}P</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter className="items-center gap-3">
          <span className="text-sm text-muted-foreground">선택 합계 {total}P</span>
          <Button className="rounded-xl" disabled={!canWrite || selected.length === 0} onClick={() => setConfirm(true)}>
            선택 실행
          </Button>
        </DialogFooter>
        <StepUpDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="포인트 일괄 실행"
          description={`${selected.length}건, 합계 ${total}P 를 실행합니다. 본인 비밀번호를 입력하세요.`}
          confirmText="실행"
          pending={execute.isPending}
          onConfirm={run}
        />
      </DialogContent>
    </Dialog>
  );
}
