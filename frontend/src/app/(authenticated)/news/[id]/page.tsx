"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Eye, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useNavigationStore } from "@/store/navigation-store";
import { LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useNewsDetail } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function NewsDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading } = useNewsDetail(id);

  useEffect(() => {
    setPageTitle("최신소식 상세");
  }, [setPageTitle]);

  if (isLoading || !data) {
    return <PageTransition><LoadingState message="소식을 불러오는 중..." /></PageTransition>;
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">대시보드</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/news">최신소식</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>상세보기</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="rounded-2xl animate-slide-in-right">
          <CardHeader className="pb-3">
            <h1 className="text-lg font-bold">{data.title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{data.writer_name}</span>
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{data.views}</span>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(data.created_at)}</span>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: data.content }} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Link href="/news"><Button variant="outline" className="rounded-xl"><ArrowLeft className="h-4 w-4 mr-1" />목록으로</Button></Link>
        </div>
      </div>
    </PageTransition>
  );
}
