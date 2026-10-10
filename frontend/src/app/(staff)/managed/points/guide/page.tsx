"use client";
import { useEffect } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { PointGuideSection } from "@/components/maintenance/point-guide-section";
import { useNavigationStore } from "@/store/navigation-store";

// 포인트 안내 — 고객 화면과 같은 안내 컴포넌트를 쓴다(정책 문구 단일화, SPEC 02 §1).
export default function StaffPointGuidePage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  useEffect(() => {
    setPageTitle("포인트 안내");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <PointGuideSection />
    </PageTransition>
  );
}
