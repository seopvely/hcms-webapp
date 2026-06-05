"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bot,
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Wallet,
  CheckCircle2,
  Monitor,
  Cpu,
} from "lucide-react";
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { PageSpinner } from "@/components/common/page-spinner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAIDevSubscription } from "@/lib/api-hooks";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-700",
};

const PLAN_FEATURES: Record<string, { title: string; items: string[] }> = {
  starter: {
    title: "STARTER 플랜 구성",
    items: [
      "ChatGPT 체계 구축",
      "Claude Design 활용",
      "Claude Code 개발환경",
      "GitHub 버전 관리",
      "HTTPS 보안 설정",
      "자동 배포 파이프라인",
    ],
  },
  business: {
    title: "BUSINESS 플랜 구성",
    items: [
      "STARTER 플랜 전체 포함",
      "runmcp 서버 구성",
      "Tmux 멀티세션 환경",
      "Docker 컨테이너화",
      "PostgreSQL 데이터베이스",
      "Django / FastAPI 백엔드",
      "CI/CD 자동화 파이프라인",
    ],
  },
  agency: {
    title: "AGENCY 플랜 구성",
    items: [
      "BUSINESS 플랜 전체 포함",
      "AI PM (프로젝트 매니저)",
      "AI Designer (UI/UX)",
      "AI Backend 개발자",
      "AI Frontend 개발자",
      "AI QA 엔지니어",
      "AI DevOps 엔지니어",
    ],
  },
  enterprise: {
    title: "ENTERPRISE 플랜 구성",
    items: [
      "전사 AI 개발팀 구성",
      "runmcp 커스터마이징",
      "MCP 연동 구성",
      "업무 자동화 시스템",
    ],
  },
};

const CUSTOMER_PREP = [
  {
    icon: Monitor,
    name: "ChatGPT Plus",
    price: "월 $20",
    desc: "AI PM · 기획자 · 마케터 역할",
  },
  {
    icon: Cpu,
    name: "Claude Max",
    price: "월 $100",
    desc: "AI 디자이너 · 개발자 역할",
  },
  {
    icon: Monitor,
    name: "권장 하드웨어",
    price: "",
    desc: "Mac Mini M4 이상, 24GB 메모리 이상",
  },
];

export default function AIDevSubscriptionDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const router = useRouter();
  const params = useParams();
  const seq = Number(params.seq);

  const { data: sub, isLoading } = useAIDevSubscription(seq);

  useEffect(() => {
    setPageTitle("AI 개발팀 구독 상세");
  }, [setPageTitle]);

  if (isLoading) return <PageSpinner />;
  if (!sub) return null;

  const features = PLAN_FEATURES[sub.plan_type] ?? {
    title: `${sub.plan_label} 플랜 구성`,
    items: [],
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 p-5 text-white">
          <button
            onClick={() => router.back()}
            className="mb-3 flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold">{sub.plan_label}</h1>
                  {sub.is_beta && (
                    <Badge className="bg-orange-400/30 text-orange-100 hover:bg-orange-400/30 text-xs">
                      BETA
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-white/75">AI 개발팀 구독</p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                STATUS_COLORS[sub.status] ?? "bg-white/20 text-white"
              }`}
            >
              {sub.status_label}
            </span>
          </div>
        </div>

        {/* 구독 정보 */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">구독 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <InfoItem
                icon={<CreditCard className="h-4 w-4 text-violet-500" />}
                label="월 구독료"
                value={`${sub.monthly_price.toLocaleString()}원/월`}
              />
              {sub.build_fee > 0 && (
                <InfoItem
                  icon={<Wallet className="h-4 w-4 text-violet-500" />}
                  label="구축비"
                  value={`${sub.build_fee.toLocaleString()}원`}
                />
              )}
              <InfoItem
                icon={<CalendarDays className="h-4 w-4 text-violet-500" />}
                label="시작일"
                value={sub.start_date}
              />
              <InfoItem
                icon={<CalendarDays className="h-4 w-4 text-violet-500" />}
                label="다음 청구일"
                value={sub.next_charge_date}
              />
            </div>
            {sub.notes && (
              <div className="mt-2 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-line">
                {sub.notes}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 플랜 구성 */}
        {features.items.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{features.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {features.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* 고객 준비물 안내 */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">고객 준비물 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CUSTOMER_PREP.map((item) => (
              <div
                key={item.name}
                className="flex items-start gap-3 rounded-xl border p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                  <item.icon className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.name}</span>
                    {item.price && (
                      <span className="text-xs text-muted-foreground">{item.price}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
