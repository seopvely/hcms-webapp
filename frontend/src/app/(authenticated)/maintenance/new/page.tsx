"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Wrench,
  ArrowLeft,
  Upload,
  X,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SimpleEditor } from "@/components/common";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useNavigationStore } from "@/store/navigation-store";
import { LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useMaintenanceProjects, useCreateMaintenance } from "@/lib/api-hooks";
import { useToast } from "@/components/common/app-toast";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function MaintenanceNewPage() {
  const router = useRouter();
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();

  const [selectedProject, setSelectedProject] = useState<string>("");
  const [title, setTitle] = useState("");
  const [contents, setContents] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPageTitle("유지보수 요청 등록");
  }, [setPageTitle]);

  const { data: projectsData, isLoading } = useMaintenanceProjects();
  const createMutation = useCreateMaintenance();

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles);
    const validFiles: File[] = [];

    for (const file of newFiles) {
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

    if (!selectedProject) {
      toast("error", "프로젝트를 선택해주세요.");
      return;
    }

    if (!title.trim()) {
      toast("error", "제목을 입력해주세요.");
      return;
    }

    const strippedContents = contents.replace(/<[^>]*>/g, "").trim();
    if (!strippedContents) {
      toast("error", "내용을 입력해주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("project_id", selectedProject);
    formData.append("title", title);
    formData.append("contents", contents);
    files.forEach((file) => formData.append("files", file));

    try {
      await createMutation.mutateAsync(formData);
      toast("success", "유지보수 요청이 등록되었습니다.");
      router.push("/maintenance");
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "등록에 실패했습니다.";
      toast("error", errorMessage);
    }
  };

  if (isLoading) {
    return (
      <PageTransition>
        <LoadingState message="프로젝트 목록을 불러오는 중..." />
      </PageTransition>
    );
  }

  const projects = projectsData?.projects ?? [];
  const selectedProjectData = projects.find(p => p.id.toString() === selectedProject);
  const isPermitted = selectedProjectData?.permit ?? true;

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
              <BreadcrumbLink href="/maintenance">유지보수</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>새 요청</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/maintenance">
              <Button variant="ghost" size="sm" className="rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                유지보수 요청 등록
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                새로운 유지보수 요청을 등록합니다.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Selection */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">프로젝트 선택</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              {projects.length === 0 ? (
                <div className="flex items-center justify-center p-8 text-center text-sm text-muted-foreground bg-muted/50 rounded-xl">
                  등록된 프로젝트가 없습니다.
                </div>
              ) : (
                <>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="w-full rounded-xl">
                      <SelectValue placeholder="프로젝트를 선택해주세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem
                          key={project.id}
                          value={project.id.toString()}
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{project.title}</span>
                            {!project.permit && (
                              <Badge variant="secondary" className="text-xs">
                                요청 불가
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedProject && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-xl">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        {(() => {
                          const project = projects.find(p => p.id.toString() === selectedProject);
                          if (!project) return null;

                          if (!project.permit) {
                            // Check contract validity first
                            if (project.contract_date && project.contract_termination_date) {
                              const today = new Date();
                              const terminationDate = new Date(project.contract_termination_date);

                              if (terminationDate < today) {
                                return `계약 기간이 만료되었습니다. (계약기간: ${project.contract_date} ~ ${project.contract_termination_date})`;
                              }
                            }

                            // Check remaining points
                            if (project.remaining_points <= 0) {
                              return "잔여 포인트가 없습니다.";
                            }

                            // Generic fallback
                            return "이 프로젝트는 현재 유지보수 요청이 불가능합니다.";
                          }

                          return `잔여 포인트: ${project.remaining_points}P`;
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Title */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">제목</h3>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="요청 제목을 입력해주세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl"
                maxLength={200}
              />
            </CardContent>
          </Card>

          {/* Contents */}
          <Card className="rounded-2xl">
            <CardHeader>
              <h3 className="font-semibold">내용</h3>
            </CardHeader>
            <CardContent>
              <SimpleEditor
                value={contents}
                onChange={setContents}
                placeholder="요청 내용을 상세히 작성해주세요"
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
                    accept="*/*"
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

          {/* Submit Button */}
          <div className="flex gap-2">
            <Link href="/maintenance" className="flex-1">
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
              className="flex-1 h-11 rounded-xl"
              disabled={createMutation.isPending || !isPermitted}
            >
              {createMutation.isPending
                ? "등록 중..."
                : !isPermitted ? "요청 불가" : "등록하기"}
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}
