"use client";
import { useEffect, useState } from "react";
import { Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/common/app-toast";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDateTime, selectClass } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Hook = {
  seq: number; name: string; target_url: string; api_key_hint: string | null; event_type: string; event_type_label: string;
  is_active: boolean; timeout: number; last_event: { status: string; status_code: number | null; created_at: string } | null;
};
type Data = { items: Hook[]; event_types: Record<string, string> };
type Log = { seq: number; event_type: string; status: string; status_code: number | null; error_message: string; created_at: string };

// 연동(웹훅) 설정 — cms 가 이벤트를 외부로 보낼 때 쓰는 설정(Django admin 대체, 관리자·2단계 인증 세션만)
export default function WebhooksPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Data>(["webhooks"], "/settings/webhooks");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    setPageTitle("연동(웹훅) 설정");
  }, [setPageTitle]);

  if (error) return <p className="text-sm text-red-600">{apiErrorDetail(error, "불러오지 못했습니다.")}</p>;
  if (isLoading || !data) return <TableSkeleton />;
  return (
    <PageTransition>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">API 키는 끝 4자리만 보입니다. 바꿀 때만 새 값을 입력하세요.</p>
        {!data.items.length && <EmptyState icon={Webhook} title="웹훅이 없습니다" />}
        {data.items.map((w) => (
          <Card key={w.seq} className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
            <HookForm hook={w} eventTypes={data.event_types} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              최근 전송: {w.last_event ? <>{fmtDateTime(w.last_event.created_at)} <Badge variant={w.last_event.status === "success" ? "secondary" : "destructive"}>{w.last_event.status} {w.last_event.status_code ?? ""}</Badge></> : "없음"}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => setOpen(open === w.seq ? null : w.seq)}>{open === w.seq ? "로그 닫기" : "전송 로그"}</Button>
            </div>
            {open === w.seq && <HookLogs seq={w.seq} />}
          </CardContent></Card>
        ))}
      </div>
    </PageTransition>
  );
}

function HookForm({ hook, eventTypes }: { hook: Hook; eventTypes: Record<string, string> }) {
  const { toast } = useToast();
  const write = useStaffWrite(["webhooks"]);
  const [v, setV] = useState({ name: hook.name, target_url: hook.target_url, event_type: hook.event_type, timeout: String(hook.timeout) });
  const [active, setActive] = useState(hook.is_active);
  const [apiKey, setApiKey] = useState("");
  const save = async () => {
    const body: Record<string, unknown> = { ...v, timeout: Number(v.timeout) || 10, is_active: active };
    if (apiKey) body.api_key = apiKey;
    try {
      await write.mutateAsync({ method: "patch", url: `/settings/webhooks/${hook.seq}`, body });
      setApiKey("");
      toast("success", "저장했습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="웹훅명"><Input className="rounded-xl" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="대상 URL"><Input className="rounded-xl" value={v.target_url} onChange={(e) => setV({ ...v, target_url: e.target.value })} /></Field>
      <Field label="이벤트">
        <select className={selectClass} value={v.event_type} onChange={(e) => setV({ ...v, event_type: e.target.value })}>
          {Object.entries(eventTypes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="타임아웃(초)"><Input className="rounded-xl" inputMode="numeric" value={v.timeout} onChange={(e) => setV({ ...v, timeout: e.target.value.replace(/\D/g, "") })} /></Field>
      <Field label={`API 키 ${hook.api_key_hint ? `(현재 ${hook.api_key_hint})` : "(없음)"}`}>
        <Input className="rounded-xl" type="password" autoComplete="new-password" placeholder="바꿀 때만 입력" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </Field>
      <div className="flex items-end justify-between gap-2">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} /> 사용</label>
        <Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button>
      </div>
    </div>
  );
}

function HookLogs({ seq }: { seq: number }) {
  const { data } = useStaffGet<{ items: Log[] }>(["webhooks", "logs", seq], `/settings/webhooks/${seq}/logs`);
  if (!data) return <TableSkeleton />;
  return (
    <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
      {data.items.map((l) => (
        <div key={l.seq} className="flex flex-wrap gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
          <span>{fmtDateTime(l.created_at)}</span>
          <span className="font-medium">{l.event_type}</span>
          <span className={l.status === "success" ? "text-emerald-700" : "text-red-600"}>{l.status} {l.status_code ?? ""}</span>
          {l.error_message && <span className="w-full text-muted-foreground">{l.error_message}</span>}
        </div>
      ))}
    </div>
  );
}
