"use client";

import { useEffect } from "react";
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Shield,
  Zap,
  Globe,
  Code,
  Code2,
  Mail,
  Phone,
  MessageCircle,
  Check,
  Sparkles,
  Wrench,
  Clock,
  Plus,
  Star,
} from "lucide-react";
import Link from "next/link";

function serviceInquiryUrl(service: string, plan: string) {
  return `/inquiries/create?service=${encodeURIComponent(service)}&plan=${encodeURIComponent(plan)}`;
}

const MAINT_TASKS = [
  { label: "텍스트·이미지·링크 수정", point: "1점" },
  { label: "디자인 소폭 수정", point: "1~2점" },
  { label: "버그 수정 (소)", point: "2~3점" },
  { label: "버그 수정 (대)", point: "4~6점" },
  { label: "속도 개선 · 보안 패치", point: "3~5점" },
  { label: "서버·도메인·SSL 관리", point: "2~3점" },
];

const DEV_TASKS = [
  { label: "신규 페이지 제작", point: "5~8점" },
  { label: "API 연동", point: "5~10점" },
  { label: "관리자 기능 추가", point: "8~15점" },
  { label: "신규 기능 개발", point: "별도 협의" },
];

const DEV_SUB_PLANS = [
  {
    name: "STARTER",
    price: "390,000",
    betaPrice: "270,000",
    maint: "15점/월",
    dev: null,
    sla: "영업일 24시간 내",
    description: "운영 중인 서비스의 안정화와 소규모 수정이 주로 필요한 경우",
    features: [
      "유지보수 포인트 15점/월",
      "텍스트·이미지·레이아웃 수정",
      "버그 수정 및 오류 대응",
      "서버·도메인·SSL 관리",
      "속도 개선 및 보안 패치",
    ],
    color: "border-slate-300",
    badge: null,
  },
  {
    name: "GROWTH",
    price: "890,000",
    betaPrice: "620,000",
    maint: "20점/월",
    dev: "15점/월",
    sla: "영업일 12시간 내",
    description: "지속적인 기능 추가와 서비스 개선이 필요한 성장 단계",
    features: [
      "유지보수 포인트 20점 + 개발 포인트 15점/월",
      "STARTER 유지보수 항목 전체 포함",
      "신규 페이지·기능 개발",
      "API 연동 및 외부 서비스 연결",
      "웹·앱·서버 전 범위 개발",
    ],
    color: "border-blue-500",
    badge: "인기",
  },
  {
    name: "SCALE",
    price: "1,790,000",
    betaPrice: "1,250,000",
    maint: "30점/월",
    dev: "40점/월",
    sla: "영업일 4시간 내",
    description: "개발 중심의 집중 투자가 필요한 경우",
    features: [
      "유지보수 포인트 30점 + 개발 포인트 40점/월",
      "GROWTH 포함 사항 전체",
      "기획·설계 단계부터 협업",
      "월간 개발 로드맵 수립",
      "우선순위 실시간 협의",
    ],
    color: "border-purple-500",
    badge: null,
  },
];

export default function ServicesPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);

  useEffect(() => {
    setPageTitle("할 수 있는 일");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-12 pb-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            할 수 있는 일
          </h1>
          <p className="text-muted-foreground">
            2026 · VAT 별도 · 고객님의 디지털 성공을 위한 맞춤형 서비스
          </p>
        </div>

        {/* 1. 통합 플랜 (호스팅 + 유지보수) */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-blue-500 pl-4">
            <Server className="h-6 w-6 text-blue-600" />
            <h2 className="text-2xl font-bold">통합 플랜 (호스팅 + 유지보수)</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Basic */}
            <Link href={serviceInquiryUrl("통합 플랜", "Basic")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Basic</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">50,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-600">매월 크레딧 2개 포함</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">웹호스팅 1사이트</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">10GB SSD 스토리지</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL/TLS 인증서</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">일일 자동 백업</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Uptime 모니터링</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">이메일 지원</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Growth */}
            <Link href={serviceInquiryUrl("통합 플랜", "Growth")} className="block">
              <Card className="rounded-2xl hover-lift border-2 border-blue-500 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500">
                    추천
                  </Badge>
                </div>
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Growth</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">110,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-600">매월 크레딧 5개 포함</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">웹호스팅 3사이트</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">50GB SSD 스토리지</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL/TLS 인증서</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">일일 자동 백업</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">24시간 모니터링</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">CDN 가속 지원</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">이메일 + 전화 지원</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Business */}
            <Link href={serviceInquiryUrl("통합 플랜", "Business")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Business</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">220,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-600">매월 크레딧 15개 포함</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">웹호스팅 무제한</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">100GB SSD 스토리지</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL/TLS 인증서</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">실시간 백업</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">24시간 모니터링 + 장애 대응</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">CDN + DDoS 방어</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">전담 엔지니어 배정</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
          <Card className="rounded-2xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-600" />
                크레딧 포인트제
              </h3>
              <p className="text-sm text-muted-foreground">
                매월 포인트가 부여되고, 6개월 선사용 가능, 계약 기준 6개월마다 초기화 갱신
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">1. 매월 포인트 부여</p>
                  <p className="text-xs text-muted-foreground">플랜에 포함된 크레딧 포인트가 매월 자동으로 부여됩니다</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">2. 6개월 선사용</p>
                  <p className="text-xs text-muted-foreground">향후 6개월치 크레딧을 미리 사용할 수 있어 대형 작업도 즉시 가능합니다</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">3. 6개월 초기화 갱신</p>
                  <p className="text-xs text-muted-foreground">계약 기준 6개월마다 포인트가 초기화되고 새롭게 갱신됩니다</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl bg-muted/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                <strong>건별 유지보수:</strong> 텍스트/이미지 30,000원~,
                스크립트 추가 50,000원~, 장애 복구 100,000원~
              </p>
            </CardContent>
          </Card>
        </section>

        {/* 2. 개발 구독 서비스 (NEW) */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-violet-500 pl-4">
            <Code2 className="h-6 w-6 text-violet-600" />
            <div>
              <h2 className="text-2xl font-bold">개발 구독 서비스</h2>
              <p className="text-sm text-muted-foreground mt-0.5">서비스를 지키는 예산과 키우는 예산을 분리해서 관리하세요</p>
            </div>
          </div>

          {/* Beta Banner */}
          <Card className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-300 dark:border-amber-700">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                    베타 요금 — 선착순 3개 기업
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    지금 신청하시면 <strong>첫 3개월간 30% 할인된 베타 요금</strong>으로 시작합니다. 베타 종료 후 정상 요금 자동 전환, 원치 않으면 언제든 해지 가능합니다.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plan Cards */}
          <div className="grid gap-5 md:grid-cols-3">
            {DEV_SUB_PLANS.map((plan) => (
              <Link key={plan.name} href={serviceInquiryUrl("개발 구독", plan.name)} className="block">
                <Card className={`rounded-2xl hover-lift border-2 ${plan.color} relative h-full`}>
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 px-3">
                        {plan.badge}
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">원/월</span>
                      </div>
                      <p className="text-xs text-amber-600 font-medium mt-0.5">
                        → 베타 {plan.betaPrice}원 (첫 3개월)
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <Wrench className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="font-medium">유지보수 {plan.maint}</span>
                      </div>
                      {plan.dev ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Code2 className="h-4 w-4 text-purple-500 shrink-0" />
                          <span className="font-medium">개발 {plan.dev}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Code2 className="h-4 w-4 shrink-0" />
                          <span>개발 포인트 없음</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4 shrink-0" />
                        <span>{plan.sla}</span>
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-1.5">
                      {plan.features.map((f) => (
                        <div key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-3">
                      <Plus className="h-3.5 w-3.5" />
                      추가 포인트: 3만 원/점
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Comparison Table */}
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">구분</th>
                    <th className="px-4 py-3 text-center font-medium">STARTER</th>
                    <th className="px-4 py-3 text-center font-medium text-blue-600">GROWTH</th>
                    <th className="px-4 py-3 text-center font-medium text-purple-600">SCALE</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">월 구독료</td>
                    <td className="px-4 py-3 text-center font-semibold">39만 원</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-600">89만 원</td>
                    <td className="px-4 py-3 text-center font-semibold text-purple-600">179만 원</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">유지보수 포인트</td>
                    <td className="px-4 py-3 text-center">15점/월</td>
                    <td className="px-4 py-3 text-center">20점/월</td>
                    <td className="px-4 py-3 text-center">30점/월</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">개발 포인트</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-center">15점/월</td>
                    <td className="px-4 py-3 text-center">40점/월</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">응답 시간</td>
                    <td className="px-4 py-3 text-center">24시간 내</td>
                    <td className="px-4 py-3 text-center">12시간 내</td>
                    <td className="px-4 py-3 text-center">4시간 내</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">추가 포인트</td>
                    <td className="px-4 py-3 text-center">3만 원/점</td>
                    <td className="px-4 py-3 text-center">3만 원/점</td>
                    <td className="px-4 py-3 text-center">3만 원/점</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground">베타가 (첫 3개월)</td>
                    <td className="px-4 py-3 text-center text-amber-600 font-medium">27만 원</td>
                    <td className="px-4 py-3 text-center text-amber-600 font-medium">62만 원</td>
                    <td className="px-4 py-3 text-center text-amber-600 font-medium">125만 원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Point System */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-blue-500" />
                  <h3 className="font-semibold text-sm">유지보수 포인트</h3>
                </div>
                <p className="text-xs text-muted-foreground">기존 서비스 안정화 · 긴급 대응 포함</p>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">작업 유형</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">소요 포인트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {MAINT_TASKS.map((t) => (
                      <tr key={t.label}>
                        <td className="py-2">{t.label}</td>
                        <td className="py-2 text-right font-medium text-blue-600">{t.point}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-purple-500" />
                  <h3 className="font-semibold text-sm">개발 포인트</h3>
                </div>
                <p className="text-xs text-muted-foreground">신규 기능·페이지 개발 · 기획 협업 포함 · GROWTH 이상</p>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-xs font-medium text-muted-foreground">작업 유형</th>
                      <th className="pb-2 text-right text-xs font-medium text-muted-foreground">소요 포인트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {DEV_TASKS.map((t) => (
                      <tr key={t.label}>
                        <td className="py-2">{t.label}</td>
                        <td className="py-2 text-right font-medium text-purple-600">{t.point}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl bg-muted/40">
            <CardContent className="pt-4 pb-4 space-y-1.5">
              <div className="flex items-start gap-2 text-sm">
                <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>포인트는 매월 1일 충전되며 당월에 소진됩니다. 이월되지 않습니다.</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Plus className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span>포인트가 부족하면 <strong>3만 원/점</strong>으로 추가 구매 가능합니다.</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 3. 홈페이지 구축 패키지 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-purple-500 pl-4">
            <Globe className="h-6 w-6 text-purple-600" />
            <h2 className="text-2xl font-bold">홈페이지 구축 패키지</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Launch Kit */}
            <Link href={serviceInquiryUrl("홈페이지 구축", "Launch Kit")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Launch Kit</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">1,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">랜딩/프로모션 1페이지</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">반응형 디자인</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL+GA 설정</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">기본 SEO</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Growth Pack */}
            <Link href={serviceInquiryUrl("홈페이지 구축", "Growth Pack")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Growth Pack</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">2,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">5–6페이지 사이트</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">관리자 CMS</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">1개월 유지보수</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Enterprise Build */}
            <Link href={serviceInquiryUrl("홈페이지 구축", "Enterprise Build")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Enterprise Build</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">3,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">맞춤 디자인·기능</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">최신 스택</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">3개월 유지보수</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 4. 서버 작업 · DevOps */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-green-500 pl-4">
            <Code className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold">서버 작업 · DevOps</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* DevOps Basic */}
            <Link href={serviceInquiryUrl("서버·DevOps", "DevOps Basic")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">DevOps Basic</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">1,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Ubuntu 서버 구축</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Nginx 설정</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Docker 환경</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">자동 백업·SSL</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* DevOps Pro */}
            <Link href={serviceInquiryUrl("서버·DevOps", "DevOps Pro")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">DevOps Pro</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">3,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">CI/CD 파이프라인</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">고가용성 DB</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">AWS S3 통합</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">WAF·교육</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 5. 부가 서비스 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-orange-500 pl-4">
            <Sparkles className="h-6 w-6 text-orange-600" />
            <h2 className="text-2xl font-bold">부가 서비스</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Link href={serviceInquiryUrl("부가서비스", "유료 SSL")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">유료 SSL (기업 인증)</h3>
                      <p className="text-sm text-muted-foreground">EV/OV 인증서</p>
                    </div>
                    <Badge variant="secondary">100,000원~/년</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={serviceInquiryUrl("부가서비스", "속도 퍼포먼스 튜닝")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">속도 퍼포먼스 튜닝</h3>
                      <p className="text-sm text-muted-foreground">로딩 속도 최적화</p>
                    </div>
                    <Badge variant="secondary">200,000원~</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={serviceInquiryUrl("부가서비스", "메일 이전")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">메일 이전</h3>
                      <p className="text-sm text-muted-foreground">메일 서버 마이그레이션</p>
                    </div>
                    <Badge variant="secondary">150,000원~</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={serviceInquiryUrl("부가서비스", "도메인 등록·이전")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">도메인 등록/이전</h3>
                      <p className="text-sm text-muted-foreground">도메인 관리 대행</p>
                    </div>
                    <Badge variant="secondary">별도 문의</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 6. 고객군별 권장 플랜 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-pink-500 pl-4">
            <Shield className="h-6 w-6 text-pink-600" />
            <h2 className="text-2xl font-bold">고객군별 권장 플랜</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="rounded-2xl hover-lift bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
              <CardHeader>
                <h3 className="text-xl font-bold">개인·소상공인</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Basic 통합 플랜</strong>
                  <br />+ <strong>Launch Kit</strong>
                </p>
                <p className="text-xs text-muted-foreground">빠르게 시작하고 안정적으로 운영</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl hover-lift bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
              <CardHeader>
                <h3 className="text-xl font-bold">중소기업</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Growth 통합 플랜</strong>
                  <br />+ <strong>Growth Pack</strong>
                </p>
                <p className="text-xs text-muted-foreground">성장을 위한 확장 가능한 플랫폼</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl hover-lift bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
              <CardHeader>
                <h3 className="text-xl font-bold">중견·대기업</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Business 통합 플랜</strong>
                  <br />+ <strong>Enterprise Build</strong>
                  <br />+ <strong>DevOps Pro</strong>
                </p>
                <p className="text-xs text-muted-foreground">엔터프라이즈급 성능과 보안</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Bottom: 문의·상담 */}
        <section className="space-y-6">
          <Card className="rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white">
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">궁금하신 점이 있으신가요?</h2>
                <p className="text-blue-100">언제든지 문의 주시면 친절하게 상담해 드립니다.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3 max-w-3xl mx-auto">
                <div className="flex items-center justify-center gap-2">
                  <Phone className="h-5 w-5" />
                  <span className="font-semibold">010-7185-8207</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Mail className="h-5 w-5" />
                  <span className="font-semibold">kks@hankyeul.com</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  <span className="font-semibold">@hklab</span>
                </div>
              </div>
              <Link href="/inquiries/create">
                <button className="rounded-xl bg-white text-blue-600 px-8 py-3 font-semibold hover:bg-blue-50 transition-colors">
                  문의하기
                </button>
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
