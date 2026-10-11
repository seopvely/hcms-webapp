"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/app-toast";
import { apiErrorDetail } from "@/components/managed/field";
import { type BoardCategory, useBoardCategoriesAll, useBoardMutation } from "@/lib/staff-content";

// 프로젝트구축진행 카테고리(프로젝트별) — 추가·이름·순서·숨김. 삭제 대신 숨김(글 연결 보존).
export function BoardCategoryManager({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data } = useBoardCategoriesAll(projectId);
  const mutate = useBoardMutation();
  const [name, setName] = useState("");

  const run = async (args: Parameters<typeof mutate.mutateAsync>[0], ok: string) => {
    try {
      await mutate.mutateAsync(args);
      toast("success", ok);
      return true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리하지 못했습니다."));
      return false;
    }
  };

  const writable = !!data?.write_enabled;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader><DialogTitle>카테고리 관리</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {data?.items.length === 0 && <p className="text-sm text-muted-foreground">카테고리가 없습니다.</p>}
          {data?.items.map((c) => <CategoryRow key={c.id} c={c} writable={writable} run={run} />)}
        </div>
        {writable && (
          <div className="flex gap-2 pt-2">
            <Input className="rounded-xl" placeholder="새 카테고리 이름" value={name} onChange={(e) => setName(e.target.value)} />
            <Button className="rounded-xl" disabled={!name.trim() || mutate.isPending}
              onClick={async () => (await run({ url: "/categories", body: { project_id: projectId, name } }, "추가했습니다.")) && setName("")}>추가</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ c, writable, run }: {
  c: BoardCategory;
  writable: boolean;
  run: (args: { url: string; body: object; method?: "post" | "patch" }, ok: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(c.name);
  const [order, setOrder] = useState(String(c.sort_order));
  const changed = name.trim() !== c.name || Number(order) !== c.sort_order;
  return (
    <div className={`flex items-center gap-2 ${c.is_active ? "" : "opacity-60"}`}>
      <Input className="w-16 rounded-xl" inputMode="numeric" value={order} disabled={!writable} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ""))} />
      <Input className="flex-1 rounded-xl" value={name} disabled={!writable} onChange={(e) => setName(e.target.value)} />
      {writable && changed && (
        <Button size="sm" className="rounded-xl" onClick={() => run({ method: "patch", url: `/categories/${c.id}`, body: { name, sort_order: Number(order) || 0 } }, "저장했습니다.")}>저장</Button>
      )}
      {writable && (
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => run({ method: "patch", url: `/categories/${c.id}`, body: { is_active: !c.is_active } }, c.is_active ? "숨겼습니다." : "다시 보이게 했습니다.")}>
          {c.is_active ? "숨김" : "사용"}
        </Button>
      )}
    </div>
  );
}
