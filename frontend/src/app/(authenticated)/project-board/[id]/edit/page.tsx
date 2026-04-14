"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, X, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { useNavigationStore } from "@/store/navigation-store";
import { LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import {
  useProjectBoardDetail,
  useUpdateProjectBoard,
  useBoardProjects,
  useBoardCategories,
} from "@/lib/api-hooks";
import { useToast } from "@/components/common/app-toast";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
  "txt", "csv", "zip", "rar", "7z",
];
const ALLOWED_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function EditProjectBoardPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();

  const { data, isLoading } = useProjectBoardDetail(id);
  const updateBoard = useUpdateProjectBoard(id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("1");
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<{ id: number; name: string; file_size: number }[]>([]);
  const [deleteAttachmentIds, setDeleteAttachmentIds] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const projectId = selectedProject ? Number(selectedProject) : null;
  const { data: projectsData } = useBoardProjects();
  const { data: categoriesData } = useBoardCategories(projectId);

  useEffect(() => {
    setPageTitle("게시글 수정");
  }, [setPageTitle]);

  useEffect(() => {
    if (data && !initialized) {
      setTitle(data.title || "");
      setContent(data.content || "");
      setSelectedProject(data.project_id ? String(data.project_id) : "");
      setSelectedCategories(
        data.categories?.filter((c) => c.id !== undefined).map((c) => c.id as number) ?? []
      );
      setSelectedStatus(data.status || "1");
      setExistingAttachments(data.attachments || []);
      setInitialized(true);
    }
  }, [data, initialized]);

  const projects = projectsData?.projects ?? [];
  const categories = categoriesData?.categories ?? [];

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles);
    const validFiles: File[] = [];
    for (const file of newFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast("error", `${file.name}은(는) 허용되지 않는 파일 형식입니다.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast("error", `${file.name}은(는) 10MB를 초과합니다.`);
        continue;
      }
      validFiles.push(file);
    }
    const totalCount = existingAttachments.length - deleteAttachmentIds.length + files.length + validFiles.length;
    if (totalCount > MAX_FILES) {
      toast("error", `최대 ${MAX_FILES}개까지만 첨부할 수 있습니다.`);
    }
    setFiles([...files, ...validFiles].slice(0, MAX_FILES));
  };

  const handleRemoveExisting = (attId: number) => {
    setDeleteAttachmentIds((prev) => [...prev, attId]);
    setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) {
      toast("error", "프로젝트를 선택해주세요.");
      return;
    }
    if (!title.trim()) {
      toast("error", "제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      toast("error", "내용을 입력해주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("content", content.trim());
    formData.append("project_id", selectedProject);
    formData.append("status", selectedStatus);
    if (selectedCategories.length > 0) {
      formData.append("category_ids", selectedCategories.join(","));
    }
    if (deleteAttachmentIds.length > 0) {
      formData.append("delete_attachment_ids", deleteAttachmentIds.join(","));
    }
    files.forEach((file) => formData.append("files", file));

    try {
      await updateBoard.mutateAsync(formData);
      toast("success", "게시글이 수정되었습니다.");
      router.push(`/project-board/${id}`);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || "게시글 수정에 실패했습니다.";
      toast("error", msg);
    }
  };

  if (isLoading || !data) {
    return (
      <PageTransition>
        <LoadingState message="게시글 정보를 불러오는 중..." />
      </PageTransition>
    );
  }

  if (!data.is_mine) {
    return (
      <PageTransition>
        <div className="text-center py-10">
          <p className="text-muted-foreground">수정 권한이 없습니다.</p>
          <Link href="/project-board">
            <Button variant="outline" className="mt-4 rounded-xl">목록으로</Button>
          </Link>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/dashboard">대시보드</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/project-board">프로젝트구축진행</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>게시글 수정</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="rounded-2xl">
          <CardHeader className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">게시글 수정</h2>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Project */}
              <div className="space-y-2">
                <label className="text-sm font-medium">프로젝트 <span className="text-red-500">*</span></label>
                <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setSelectedCategories([]); }}>
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue placeholder="프로젝트를 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              {projectId && categories.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">구성 메뉴 (복수 선택 가능)</label>
                  <div className="flex flex-wrap gap-3 p-3 border rounded-xl bg-muted/30">
                    {categories.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedCategories.includes(c.id)}
                          onCheckedChange={(checked) => {
                            setSelectedCategories((prev) =>
                              checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                            );
                          }}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">상태</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full rounded-xl h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">진행중</SelectItem>
                    <SelectItem value="2">완료</SelectItem>
                    <SelectItem value="3">보류</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">제목 <span className="text-red-500">*</span></label>
                <Input id="title" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="rounded-xl h-11" required />
                <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <label htmlFor="content" className="text-sm font-medium">내용 <span className="text-red-500">*</span></label>
                <Textarea id="content" placeholder="내용" value={content} onChange={(e) => setContent(e.target.value)} className="rounded-xl min-h-[200px] resize-y" required />
              </div>

              {/* Existing Attachments */}
              {existingAttachments.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">기존 첨부파일</label>
                  <div className="space-y-2">
                    {existingAttachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.name}</p>
                          <p className="text-xs text-muted-foreground">{att.file_size ? formatFileSize(att.file_size) : ""}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveExisting(att.id)} className="ml-2 h-8 w-8 p-0 rounded-lg text-red-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Files */}
              <div className="space-y-2">
                <label className="text-sm font-medium">새 첨부파일</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm mb-2">파일을 드래그하거나 클릭하여 선택</p>
                  <label>
                    <input type="file" multiple className="hidden" onChange={(e) => handleFileSelect(e.target.files)} accept={ALLOWED_ACCEPT} />
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={(e) => { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                      파일 선택
                    </Button>
                  </label>
                </div>
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))} className="ml-2 h-8 w-8 p-0 rounded-lg">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-11" onClick={() => router.back()} disabled={updateBoard.isPending}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> 취소
                </Button>
                <Button type="submit" className="flex-1 rounded-xl h-11 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700" disabled={updateBoard.isPending}>
                  {updateBoard.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />수정 중...</>) : "게시글 수정"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
