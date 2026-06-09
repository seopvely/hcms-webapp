"use client";

import { useState } from "react";
import { Info, ChevronDown, ChevronUp, CheckCircle2, Monitor, Cpu, Globe, Laptop, XCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  {
    key: "starter",
    name: "STARTER",
    price: "구축비 199만원",
    subscription: null as string | null,
    subscriptionFeatures: [] as string[],
    color: "border-slate-300 bg-slate-50 dark:bg-slate-900/30 dark:border-slate-700",
    nameColor: "text-slate-600 dark:text-slate-400",
    badge: null as string | null,
    features: [
      "Mac Mini 환경 구성",
      "Parallels Desktop 구성",
      "Ubuntu VM 구성",
      "ChatGPT 활용 환경 구축",
      "Claude 활용 환경 구축",
      "GitHub 연동",
      "HTTPS 적용",
      "자동 배포 환경 구축",
      "기본 운영 매뉴얼 제공",
      "AI 활용 워크플로우 제공",
    ],
    notIncluded: [
      "runmcp",
      "모바일 운영 관리",
      "다중 프로젝트 운영",
      "월 구독 지원",
    ],
  },
  {
    key: "business",
    name: "BUSINESS",
    price: "구축비 499만원",
    subscription: "월 구독 199,000원" as string | null,
    subscriptionFeatures: [
      "월 1회 원격 점검",
      "프롬프트 개선 지원",
      "운영 노하우 업데이트",
      "신규 활용 사례 제공",
      "운영 프로세스 지원",
    ],
    color: "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700",
    nameColor: "text-blue-600 dark:text-blue-400",
    badge: "추천" as string | null,
    features: [
      "STARTER 플랜 전체 포함",
      "runmcp 구축",
      "모바일 관리",
      "세션 유지",
      "다중 프로젝트 운영",
      "AI 운영 프로세스 구축",
      "운영 노하우 제공",
    ],
    notIncluded: [] as string[],
  },
];

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
    icon: Laptop,
    name: "Parallels Desktop",
    price: "",
    desc: "Mac에서 Ubuntu VM 실행을 위한 가상화 소프트웨어",
  },
  {
    icon: Monitor,
    name: "Mac Mini",
    price: "",
    desc: "M4 이상 권장, 24GB 메모리 이상",
  },
  {
    icon: Globe,
    name: "도메인",
    price: "",
    desc: "서비스 운영을 위한 도메인",
  },
];

export function SubscriptionGuideSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-violet-500" />
          <span>구독 안내</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t">
          <Tabs defaultValue="plans" className="mt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="plans">플랜 구성</TabsTrigger>
              <TabsTrigger value="prep">고객 준비물</TabsTrigger>
            </TabsList>

            {/* Tab 1: 플랜 구성 */}
            <TabsContent value="plans">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLANS.map((plan) => (
                    <Card key={plan.key} className={`py-4 ${plan.color}`}>
                      <CardContent className="px-4 py-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs font-bold ${plan.nameColor}`}>{plan.name}</p>
                            {plan.badge && (
                              <Badge className="h-4 px-1.5 text-[10px] bg-blue-500 text-white border-0">
                                {plan.badge}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-foreground/70">{plan.price}</span>
                        </div>
                        <ul className="space-y-1">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-1.5 text-xs text-foreground/80">
                              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        {plan.notIncluded.length > 0 && (
                          <ul className="space-y-1 pt-1 border-t border-dashed">
                            {plan.notIncluded.map((f) => (
                              <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <XCircle className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                        {plan.subscription && (
                          <div className="pt-1 border-t">
                            <p className="text-xs font-semibold text-blue-600 mb-1">{plan.subscription}</p>
                            <ul className="space-y-1">
                              {plan.subscriptionFeatures.map((f) => (
                                <li key={f} className="flex items-start gap-1.5 text-xs text-foreground/80">
                                  <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                                  {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="py-4 border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800">
                  <CardContent className="px-4 py-0">
                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                      AI는 이미 있습니다. 중요한 것은 활용 방법입니다.
                    </p>
                    <p className="text-xs text-violet-600/80 dark:text-violet-400 mt-0.5">
                      한결랩은 AI를 실제 업무에 적용할 수 있는 환경과 운영 노하우를 제공합니다.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 2: 고객 준비물 */}
            <TabsContent value="prep">
              <div className="space-y-3">
                {CUSTOMER_PREP.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-start gap-3 rounded-xl border p-3 bg-muted/30"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                      <item.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
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

                <p className="text-xs text-muted-foreground pt-1">
                  고객 준비물은 AI 개발팀 구독 서비스 이용을 위한 권장 사항입니다.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 pt-3 border-t flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs text-muted-foreground">
            <span>전화: 010-7185-8207</span>
            <span>이메일: kks@hankyeul.com</span>
          </div>
        </div>
      )}
    </div>
  );
}
