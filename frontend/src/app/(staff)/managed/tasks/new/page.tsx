"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleEditor } from "@/components/common/simple-editor";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { TASK_STATUSES, TASK_TYPES } from "@/components/managed/task-options";
import { useNavigationStore } from "@/store/navigation-store";
import { useLookupCompanies, useLookupManagers, useLookupProjects } from "@/lib/staff-maintenance";
import { useTaskMutation } from "@/lib/staff-support";

export default function StaffTaskNewPage() {
  const router = useRouter();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const mutate = useTaskMutation();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [form, setForm] = useState<Record<string, string>>({ status: "1", task_type: "6" });
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { data: companies } = useLookupCompanies();
  const { data: projects } = useLookupProjects(companyId);
  const { data: managers } = useLookupManagers(companyId);

  useEffect(() => {
    setPageTitle("건별작업 등록");
  }, [setPageTitle]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!companyId || !form.title?.trim()) {
      toast("warning", "업체와 제목을 입력하세요.");
      return;
    }
    const fd = new FormData();
    fd.append("company_id", String(companyId));
    fd.append("content", content);
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
    if (file) fd.append("file", file);
    try {
      const res = await mutate.mutateAsync({ method: "post", url: "", body: fd });
      toast("success", "등록했습니다.");
      router.replace(`/managed/tasks/${res.seq}`);
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <Card className="mx-auto max-w-3xl rounded-2xl">
        <CardContent className="space-y-4 pt-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="업체 *">
              <select className={selectClass} value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">선택</option>
                {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="프로젝트">
              <select className={selectClass} value={form.project_id ?? ""} onChange={set("project_id")} disabled={!companyId}>
                <option value="">선택 안 함</option>
                {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="요청자(고객)">
              <select className={selectClass} value={form.writer_seq ?? ""} onChange={set("writer_seq")} disabled={!companyId}>
                <option value="">선택 안 함</option>
                {managers?.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="작업 유형">
              <select className={selectClass} value={form.task_type} onChange={set("task_type")}>
                {TASK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="상태">
              <select className={selectClass} value={form.status} onChange={set("status")}>
                {TASK_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="예상 시간(h)">
              <Input type="number" step="0.5" min={0} className="rounded-xl" value={form.estimated_hours ?? ""} onChange={set("estimated_hours")} />
            </Field>
            <Field label="요청일"><Input type="date" className="rounded-xl" value={form.request_date ?? ""} onChange={set("request_date")} /></Field>
            <Field label="마감일"><Input type="date" className="rounded-xl" value={form.deadline ?? ""} onChange={set("deadline")} /></Field>
            <Field label="작업일"><Input type="date" className="rounded-xl" value={form.work_date ?? ""} onChange={set("work_date")} /></Field>
            <Field label="예산(원)"><Input type="number" min={0} className="rounded-xl" value={form.budget ?? ""} onChange={set("budget")} /></Field>
          </div>
          <Field label="제목 *"><Input className="rounded-xl" value={form.title ?? ""} onChange={set("title")} /></Field>
          <SimpleEditor imageUpload="staff" value={content} onChange={setContent} placeholder="작업 내용" />
          <Input type="file" className="rounded-xl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>취소</Button>
            <Button className="rounded-xl" onClick={submit} disabled={mutate.isPending}>등록</Button>
          </div>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
