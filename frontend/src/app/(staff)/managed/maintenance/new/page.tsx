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
import { useNavigationStore } from "@/store/navigation-store";
import { useCreateStaffMaintenance, useLookupCompanies, useLookupManagers, useLookupProjects } from "@/lib/staff-maintenance";

// 직원이 고객 대신 유지보수 요청을 등록한다(무상 유지보수 기간이면 자동으로 무상 처리).
export default function StaffMaintenanceNewPage() {
  const router = useRouter();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const create = useCreateStaffMaintenance();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [projectId, setProjectId] = useState("");
  const [writer, setWriter] = useState("");
  const [title, setTitle] = useState("");
  const [contents, setContents] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const { data: companies } = useLookupCompanies();
  const { data: projects } = useLookupProjects(companyId);
  const { data: managers } = useLookupManagers(companyId);

  useEffect(() => {
    setPageTitle("유지보수 요청 등록");
  }, [setPageTitle]);

  const submit = async () => {
    if (!companyId || !title.trim()) {
      toast("warning", "업체와 제목을 입력하세요.");
      return;
    }
    const form = new FormData();
    form.append("company_id", String(companyId));
    if (projectId) form.append("project_id", projectId);
    if (writer) form.append("writer_seq", writer);
    form.append("title", title);
    form.append("contents", contents);
    Array.from(files ?? []).forEach((f) => form.append("attachments", f));
    try {
      const res = await create.mutateAsync(form);
      toast("success", "등록했습니다.");
      router.replace(`/managed/maintenance/${res.seq}`);
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
              <select className={selectClass} value={companyId ?? ""} onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : undefined); setProjectId(""); setWriter(""); }}>
                <option value="">선택</option>
                {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="프로젝트">
              <select className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!companyId}>
                <option value="">선택 안 함</option>
                {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="요청자(고객)">
              <select className={selectClass} value={writer} onChange={(e) => setWriter(e.target.value)} disabled={!companyId}>
                <option value="">선택 안 함</option>
                {managers?.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="제목 *">
            <Input className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <SimpleEditor imageUpload="staff" value={contents} onChange={setContents} placeholder="요청 내용" />
          <Input type="file" multiple className="rounded-xl" onChange={(e) => setFiles(e.target.files)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>
              취소
            </Button>
            <Button className="rounded-xl" onClick={submit} disabled={create.isPending}>
              등록
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
