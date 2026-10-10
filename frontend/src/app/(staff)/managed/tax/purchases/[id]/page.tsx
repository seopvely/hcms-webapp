"use client";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";
import { InvoiceForm } from "../../invoice-form";
import { TaxShell } from "../../tax-ui";

export default function TaxPurchasesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useStaffGet<Record<string, unknown>>(["tax", "purchases", id], isNew ? null : `/tax/purchases/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "매입 세금계산서 등록" : "매입 세금계산서");
  }, [setPageTitle, isNew]);
  return (
    <PageTransition>
      <TaxShell cmsPath="/managed/tax/">
        {!isNew && (isLoading || !data) ? <DetailSkeleton /> : <InvoiceForm key={id} kind="purchases" id={id} data={isNew ? null : data!} />}
      </TaxShell>
    </PageTransition>
  );
}
