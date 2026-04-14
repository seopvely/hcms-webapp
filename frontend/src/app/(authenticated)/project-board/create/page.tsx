"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, X, Loader2 } from "lucide-react";
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
import { PageTransition } from "@/components/layout/page-transition";
import { useCreateProjectBoard, useBoardProjects, useBoardCategories } from "@/lib/api-hooks";
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

export default function CreateProjectBoardPage() {
  const router = useRouter();
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();
  const createBoard = useCreateProjectBoard();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("1");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const projectId = selectedProject ? Number(selectedProject) : null;
  const { data: projectsData } = useBoardProjects();
  const { data: categoriesData } = useBoardCategories(projectId);

  useEffect(() => {
    setPageTitle("게시글 등록");
  }, [setPageTitle]);

  useEffect(() => {
    setSelectedCategories([]);
  }, [selectedProject]);

  const projects = projectsData?.projects ?? [];
  const categories = categoriesData?.categories ?? [];
  const activeProjects = projects.filter((p) => p.is_active);

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
    if (files.length + validFiles.length > MAX_FILES) {
      toast("error", `최대 ${MAX_FILES}개까지만 첨부할 수 있습니다.`);
      setFiles([...files, ...validFiles].slice(0, MAX_FILES));
    } else {
      setFiles([...files, ...validFiles]);
    }
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
    files.forEach((file) => formData.append("files", file));

    try {
      await createBoard.mutateAsync(formData);
      toast("success", "게시글이 등록되었습니다.");
      router.push("/project-board");
    } catch (error: any) {
      const msg = error?.response?.data?.detail || "게시글 등록에 실패했습니다.";
      toast("error", msg);
    }
  };

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
              <BreadcrumbPage>게시글 등록</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="rounded-2xl">
          <CardHeader className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">게시글 등록</h2>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Project */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  프로젝트 <span className="text-red-500">*</span>
                </label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue placeholder="프로젝트를 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProjects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.title}
                      </SelectItem>
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
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">진행중</SelectItem>
                    <SelectItem value="2">완료</SelectItem>
                    <SelectItem value="3">보류</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  제목 <span className="text-red-500">*</span>
                </label>
                <Input
                  id="title"
                  placeholder="제목을 입력해주세요 (최대 200자)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="rounded-xl h-11"
                  required
                />
                <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <label htmlFor="content" className="text-sm font-medium">
                  내용 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  id="content"
                  placeholder="요청사항을 입력해주세요"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="rounded-xl min-h-[200px] resize-y"
                  required
                />
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">첨부파일</label>
                <p className="text-xs text-muted-foreground">최대 {MAX_FILES}개, 각 파일 10MB 이하</p>
                <div className="space-y-3">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">파일을 드래그하거나 클릭하여 선택</p>
                    <p className="text-xs text-muted-foreground mb-3">PNG, JPG, PDF, DOCX, XLSX 등</p>
                    <label>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        accept={ALLOWED_ACCEPT}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={(e) => {
                          e.preventDefault();
                          (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                        }}
                        disabled={files.length >= MAX_FILES}
                      >
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                            className="ml-2 h-8 w-8 p-0 rounded-lg"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl h-11"
                  onClick={() => router.back()}
                  disabled={createBoard.isPending}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  취소
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-xl h-11 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700"
                  disabled={createBoard.isPending}
                >
                  {createBoard.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      등록 중...
                    </>
                  ) : (
                    "게시글 등록"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
