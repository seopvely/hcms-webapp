"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Globe, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/app-toast";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Site = {
  seq: number; site_name: string; url: string; description: string; tech_stack: string; category: string | null;
  production_year: number | null; display_order: number; is_active: boolean; thumbnail_url: string | null;
};
type Data = { items: Site[]; categories: { id: number; name: string }[]; write_enabled: boolean };

// 레퍼런스 사이트 — 홈페이지 포트폴리오(공개 API GET /api/reference-sites/). 순서는 위·아래 버튼으로.
export default function ReferenceSitesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data, isLoading } = useStaffGet<Data>(["reference-sites"], "/reference-sites");
  const write = useStaffWrite(["reference-sites"]);
  const [editing, setEditing] = useState<Site | "new" | null>(null);
  useEffect(() => {
    setPageTitle("레퍼런스 사이트");
  }, [setPageTitle]);

  const move = async (index: number, dir: -1 | 1) => {
    if (!data) return;
    const ids = data.items.map((s) => s.seq);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await write.mutateAsync({ url: "/reference-sites/reorder/save", body: { ids } });
    } catch (err) {
      toast("error", apiErrorDetail(err, "순서를 바꾸지 못했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/reference-sites/`} />}
        <p className="text-sm text-muted-foreground">노출 순서대로. 저장하면 홈페이지에는 캐시(5분) 뒤 반영됩니다.</p>
        <PageActions>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> 등록</Button>}
        </PageActions>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Globe} title="레퍼런스가 없습니다" />
        ) : (
          <Card className="rounded-2xl"><CardContent className="divide-y p-0">
            {data.items.map((s, i) => (
              <div key={s.seq} className={`flex items-center gap-3 px-4 py-3 ${s.is_active ? "" : "opacity-50"}`}>
                {s.thumbnail_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded-lg border object-cover" />
                  : <div className="h-12 w-20 shrink-0 rounded-lg border bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {s.site_name}
                    {s.category && <Badge variant="outline">{s.category}</Badge>}
                    {!s.is_active && <Badge variant="secondary">숨김</Badge>}
                  </p>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:underline">
                    {s.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {data.write_enabled && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0 || write.isPending} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === data.items.length - 1 || write.isPending} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(s)}>수정</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent></Card>
        )}
      </div>
      {editing && <SiteDialog site={editing === "new" ? null : editing} categories={data?.categories ?? []} onClose={() => setEditing(null)} />}
    </PageTransition>
  );
}

function SiteDialog({ site, categories, onClose }: { site: Site | null; categories: { id: number; name: string }[]; onClose: () => void }) {
  const { toast } = useToast();
  const write = useStaffWrite(["reference-sites"]);
  const [v, setV] = useState({
    site_name: site?.site_name ?? "", url: site?.url ?? "", description: site?.description ?? "", tech_stack: site?.tech_stack ?? "",
    category: site?.category ?? "", production_year: site?.production_year ? String(site.production_year) : "",
  });
  const [active, setActive] = useState(site?.is_active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [removeThumb, setRemoveThumb] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    const form = new FormData();
    Object.entries(v).forEach(([k, val]) => form.append(k, val));
    form.append("is_active", String(active));
    if (file) form.append("thumbnail", file);
    if (removeThumb) form.append("remove_thumbnail", "true");
    try {
      await write.mutateAsync({ url: site ? `/reference-sites/${site.seq}` : "/reference-sites", body: form });
      toast("success", "저장했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const remove = async () => {
    if (!site || !confirm(`'${site.site_name}' 을(를) 삭제할까요? 썸네일도 지워집니다.`)) return;
    try {
      await write.mutateAsync({ url: `/reference-sites/${site.seq}/delete`, body: {} });
      toast("success", "삭제했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "삭제에 실패했습니다."));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader><DialogTitle>{site ? "레퍼런스 수정" : "레퍼런스 등록"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="사이트명 *"><Input className="rounded-xl" value={v.site_name} onChange={set("site_name")} /></Field>
          <Field label="URL *"><Input className="rounded-xl" value={v.url} onChange={set("url")} placeholder="https://" /></Field>
          <Field label="카테고리">
            <Input className="rounded-xl" list="ref-categories" value={v.category} onChange={set("category")} placeholder="없으면 새로 만듭니다" />
            <datalist id="ref-categories">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label="제작연도"><Input className="rounded-xl" inputMode="numeric" value={v.production_year} onChange={set("production_year")} /></Field>
          <Field label="기술스택(쉼표 구분)" className="sm:col-span-2"><Input className="rounded-xl" value={v.tech_stack} onChange={set("tech_stack")} /></Field>
          <Field label="간단설명" className="sm:col-span-2"><Textarea className="min-h-24 rounded-xl" value={v.description} onChange={set("description")} /></Field>
          <Field label="썸네일(jpg·png·gif·webp)" className="sm:col-span-2">
            <Input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="rounded-xl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {site?.thumbnail_url && !file && (
              <label className="mt-1 flex items-center gap-2 text-xs"><Checkbox checked={removeThumb} onCheckedChange={(c) => setRemoveThumb(c === true)} /> 기존 썸네일 지우기</label>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} /> 홈페이지에 노출</label>
        </div>
        <DialogFooter className="gap-2">
          {site && <Button variant="outline" className="rounded-xl text-red-600" onClick={remove} disabled={write.isPending}>삭제</Button>}
          <Button className="rounded-xl" onClick={save} disabled={write.isPending || !v.site_name.trim() || !v.url.trim()}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
