"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { useCreateTask } from "@/lib/api-hooks";
import { useToast } from "@/components/common/app-toast";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
  "txt", "csv",
  "zip", "rar", "7z",
];

const ALLOWED_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

const TASK_TYPES = [
  { value: "1", label: "계약" },
  { value: "2", label: "기획" },
  { value: "3", label: "디자인" },
  { value: "4", label: "프론트엔드" },
  { value: "5", label: "백엔드" },
  { value: "6", label: "유지보수" },
  { value: "7", label: "기타" },
];

export default function TaskCreatePage() {
  const router = useRouter();
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();

  const [taskType, setTaskType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPageTitle("건별작업 등록");
  }, [setPageTitle]);

  const createMutation = useCreateTask();

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
      if (file.size > 10 * 1024 * 1024) {
        toast("error", `${file.name}은(는) 10MB를 초과합니다.`);
        continue;
      }
      validFiles.push(file);
    }

    if (files.length + validFiles.length > 10) {
      toast("error", "최대 10개까지만 첨부할 수 있습니다.");
      setFiles([...files, ...validFiles].slice(0, 10));
    } else {
      setFiles([...files, ...validFiles]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskType) {
      toast("error", "작업 유형을 선택해주세요.");
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
    formData.append("task_type", taskType);
    formData.append("title", title);
    formData.append("content", content);
    files.forEach((file) => formData.append("files", file));

    try {
      await createMutation.mutateAsync(formData);
      toast("success", "건별작업이 등록되었습니다.");
      router.push("/tasks");
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "등록에 실패했습니다.";
      toast("error", errorMessage);
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">대시보드</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/tasks">건별작업</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>작업 등록</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tasks">
              <Button variant="ghost" size="sm" className="rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">건별작업 등록</h1>
              <p className="text-sm text-muted-foreground mt-1">
                새로운 건별작업을 등록합니다.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Type */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">작업 유형</h3>
            </CardHeader>
            <CardContent>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue placeholder="작업 유형을 선택해주세요" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Title */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">제목</h3>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="작업 제목을 입력해주세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
                maxLength={200}
              />
            </CardContent>
          </Card>

          {/* Content */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">내용</h3>
            </CardHeader>
            <CardContent>
              <textarea
                placeholder="작업 내용을 상세히 작성해주세요"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full min-h-[200px] px-3 py-2 rounded-xl border border-input bg-transparent text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                rows={8}
              />
            </CardContent>
          </Card>

          {/* File Upload */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">파일 첨부</h3>
              <p className="text-xs text-muted-foreground">
                최대 10개, 각 파일 10MB 이하
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center transition-colors
                  ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
                `}
              >
                <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">
                  파일을 드래그하거나 클릭하여 선택
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  PNG, JPG, PDF, DOCX, XLSX 등
                </p>
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
                  >
                    파일 선택
                  </Button>
                </label>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-xl"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="ml-2 h-8 w-8 p-0 rounded-lg"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex gap-2">
            <Link href="/tasks" className="flex-1">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-xl"
              >
                취소
              </Button>
            </Link>
            <Button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  등록 중...
                </>
              ) : (
                "등록하기"
              )}
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}
