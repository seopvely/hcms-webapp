"use client";
import { useEffect, useState } from "react";
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDateTime } from "@/components/managed/field";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Prompt = { seq: number; name: string; prompt_content: string; claude_model: string; temperature: number; session_id: string; average_rating: number;
  rating_count: number; usage_count: number; is_default: boolean; is_active: boolean; updated_at: string | null };
type Data = { items: Prompt[]; models: string[]; write_enabled: boolean };

// AI 프롬프트 템플릿 — 견적서·계약서 AI 모달이 불러 쓰는 문구. AI 실행 자체는 아직 cms(D18).
export default function AIPromptsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [showInactive, setShowInactive] = useState(false);
  const { data } = useStaffGet<Data>(["ai-prompts"], "/ai-prompts", { include_inactive: showInactive });
  const [editing, setEditing] = useState<Prompt | null>(null);
  useEffect(() => {
    setPageTitle("AI 프롬프트");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/estimate/`} />}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 비활성 포함</label>
          <div className="flex-1" />
          {data?.write_enabled && <Button className="rounded-xl" onClick={() => setEditing({ seq: 0, name: "", prompt_content: "", claude_model: data.models[0] ?? "claude-haiku-4-5", temperature: 0.7, session_id: "", average_rating: 0, rating_count: 0, usage_count: 0, is_default: false, is_active: true, updated_at: null })}><Plus className="mr-1 h-4 w-4" /> 새 프롬프트</Button>}
        </div>
        {editing && <PromptEditor key={editing.seq} p={editing} models={data?.models ?? []} onDone={() => setEditing(null)} />}
        {data?.items.map((p) => (
          <Card key={p.seq} className={`rounded-2xl ${p.is_active ? "" : "opacity-60"}`}><CardContent className="space-y-1 pt-4 pb-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{p.name}</span>
              {p.is_default && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">기본</span>}
              <span className="text-xs text-muted-foreground">{p.claude_model} · T {p.temperature}</span>
              <span className="flex items-center gap-0.5 text-xs text-amber-600"><Star className="h-3 w-3" /> {p.average_rating.toFixed(1)} ({p.rating_count})</span>
              <span className="text-xs text-muted-foreground">사용 {p.usage_count}회 · {fmtDateTime(p.updated_at)}</span>
              <div className="flex-1" />
              {data.write_enabled && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(p)}>수정</Button>}
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{p.prompt_content}</p>
          </CardContent></Card>
        ))}
      </div>
    </PageTransition>
  );
}

function PromptEditor({ p, models, onDone }: { p: Prompt; models: string[]; onDone: () => void }) {
  const { toast } = useToast();
  const write = useStaffWrite(["ai-prompts"]);
  const [v, setV] = useState({ ...p });
  const save = async () => {
    try {
      await write.mutateAsync({ url: "/ai-prompts", body: { ...v, seq: p.seq || null } });
      toast("success", "저장했습니다.");
      onDone();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <Card className="rounded-2xl border-blue-300"><CardContent className="space-y-2 pt-4 pb-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <Input className="rounded-xl sm:col-span-2" placeholder="이름" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input className="rounded-xl" list="ai-models" value={v.claude_model} onChange={(e) => setV({ ...v, claude_model: e.target.value })} />
        <Input className="rounded-xl" type="number" step="0.1" min={0} max={1} value={v.temperature} onChange={(e) => setV({ ...v, temperature: Number(e.target.value) })} />
      </div>
      <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      <Textarea className="min-h-48 rounded-xl font-mono text-xs" value={v.prompt_content} onChange={(e) => setV({ ...v, prompt_content: e.target.value })} />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={v.is_default} onChange={(e) => setV({ ...v, is_default: e.target.checked })} /> 기본 프롬프트</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} /> 활성</label>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDone}>취소</Button>
        <Button size="sm" className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button>
      </div>
    </CardContent></Card>
  );
}
