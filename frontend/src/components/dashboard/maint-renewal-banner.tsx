"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { CalendarClock, Check, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppAlertDialog, useToast } from "@/components/common";
import {
  type HostingType,
  type MaintPlanInfo,
  type MaintRenewalInfo,
  useRespondMaintRenewal,
} from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

const PLAN_ORDER = ["basic", "growth", "business"];

const formatWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function errorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

function HostingToggle({ value, onChange }: { value: HostingType; onChange: (v: HostingType) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-white/20 p-1 text-xs font-semibold">
      {(["I", "E"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 transition ${value === v ? "bg-white text-indigo-700" : "text-white hover:bg-white/10"}`}
        >
          {v === "I" ? "한결랩 호스팅" : "외부 호스팅"}
        </button>
      ))}
    </div>
  );
}

function RenewalCard({ renewal, plans }: { renewal: MaintRenewalInfo; plans: Record<string, MaintPlanInfo> }) {
  const { toast } = useToast();
  const respond = useRespondMaintRenewal();
  const [hosting, setHosting] = useState<HostingType>(renewal.hosting_type ?? "I");
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [plan, setPlan] = useState("growth");
  const [provider, setProvider] = useState("");
  const [memo, setMemo] = useState("");

  const planCodes = PLAN_ORDER.filter((code) => plans[code]);
  const priceOf = (code: string, h: HostingType) =>
    h === "E" ? plans[code].external_price : plans[code].internal_price;

  const submit = async (response: "accepted" | "declined") => {
    try {
      await respond.mutateAsync({
        id: renewal.id,
        response,
        ...(response === "accepted"
          ? { chosen_plan: plan, hosting_type: hosting, hosting_provider: hosting === "E" ? provider : undefined }
          : {}),
        memo: memo || undefined,
      });
      setAcceptOpen(false);
      toast("success", "응답이 접수되었습니다.");
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setAcceptOpen(false);
      }
      toast("error", errorMessage(error, "응답 처리 중 오류가 발생했습니다."));
    }
  };

  const dday = renewal.days_left >= 0 ? `D-${renewal.days_left}` : `만료 후 ${-renewal.days_left}일 경과`;

  if (renewal.responded) {
    const accepted = renewal.status !== "declined";
    return (
      <Card className="rounded-2xl border-0 shadow-lg p-5">
        <div className="flex items-start gap-3">
          <CheckCircle className={`h-5 w-5 mt-0.5 shrink-0 ${accepted ? "text-indigo-600" : "text-slate-400"}`} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{renewal.project_title}</p>
            <p className="text-sm text-gray-600 mt-1">
              {accepted
                ? "응답이 접수되었습니다. 담당자가 견적서를 보내드립니다."
                : "유지보수 미이용으로 접수되었습니다. 변경을 원하시면 담당자에게 문의해 주세요."}
            </p>
            {accepted && renewal.chosen_plan && plans[renewal.chosen_plan] && (
              <p className="text-xs text-gray-500 mt-1">
                선택: {plans[renewal.chosen_plan].label} · {renewal.hosting_type === "E" ? "외부 호스팅" : "한결랩 호스팅"}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl overflow-hidden border-0 shadow-lg">
      <div className="p-5 text-white bg-gradient-to-r from-[#667eea] to-[#764ba2]">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 opacity-80" />
            <h2 className="text-sm font-semibold opacity-90">유지보수를 계속하시겠어요?</h2>
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">{dday}</span>
        </div>
        <p className="text-base font-bold">{renewal.project_title}</p>
        <p className="text-xs text-white/80 mt-1">
          계약 만료일 {formatDate(renewal.due_date)} — 만료 후에도 유지보수를 받으시려면 요금제를 선택해 주세요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <HostingToggle value={hosting} onChange={setHosting} />
          <span className="text-xs text-white/80">
            {hosting === "E" ? "호스팅비는 호스팅 업체에 직접 결제, 유지보수비만 청구됩니다." : "호스팅 + 유지보수 통합 요금입니다."}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {planCodes.map((code) => {
            const p = plans[code];
            const services = hosting === "E" ? p.services_external : p.services_internal;
            return (
              <div key={code} className="rounded-xl bg-white/10 p-3">
                <p className="text-xs font-bold tracking-wide opacity-90">{p.label}</p>
                <p className="text-lg font-bold mt-1">
                  {formatWon(priceOf(code, hosting))}
                  <span className="text-xs font-normal opacity-80"> / 월</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {services.map((s) => (
                    <li key={s} className="flex items-start gap-1.5 text-xs text-white/90">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => setAcceptOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-white/90"
          >
            유지보수 희망
          </button>
          <button
            type="button"
            onClick={() => setDeclineOpen(true)}
            disabled={respond.isPending}
            className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30 disabled:opacity-50"
          >
            이용 안 함
          </button>
        </div>
      </div>

      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>유지보수 희망</DialogTitle>
            <DialogDescription>{renewal.project_title} — 선택하신 내용으로 담당자가 견적서를 보내드립니다.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">호스팅 구분</p>
              <div className="grid grid-cols-2 gap-2">
                {(["I", "E"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setHosting(v)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium ${hosting === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"}`}
                  >
                    {v === "I" ? "한결랩 호스팅" : "외부 호스팅"}
                  </button>
                ))}
              </div>
              {hosting === "E" && (
                <Input
                  className="mt-2 rounded-xl"
                  placeholder="이용 중인 호스팅 업체명 (예: 카페24)"
                  value={provider}
                  maxLength={200}
                  onChange={(e) => setProvider(e.target.value)}
                />
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">요금제</p>
              <div className="space-y-2">
                {planCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setPlan(code)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm ${plan === code ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}
                  >
                    <span className="font-semibold text-gray-800">
                      {plans[code].label}
                      <span className="ml-2 text-xs font-normal text-gray-500">월 {plans[code].points}포인트</span>
                    </span>
                    <span className="font-bold text-gray-900">{formatWon(priceOf(code, hosting))} / 월</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">요청사항 (선택)</p>
              <Textarea
                className="rounded-xl"
                rows={3}
                maxLength={1000}
                placeholder="연락 가능한 시간 등 전달하실 내용을 적어 주세요."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setAcceptOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => submit("accepted")}
              disabled={respond.isPending}
              className="rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {respond.isPending ? "접수 중..." : "신청하기"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppAlertDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="유지보수를 이용하지 않으시겠어요?"
        description="계약 만료 후에는 유지보수 요청이 제한됩니다. 나중에 다시 원하시면 담당자에게 문의해 주세요."
        confirmText="이용 안 함"
        variant="warning"
        onConfirm={() => submit("declined")}
      />
    </Card>
  );
}

export function MaintRenewalBanner({
  renewals,
  plans,
}: {
  renewals: MaintRenewalInfo[];
  plans: Record<string, MaintPlanInfo> | null | undefined;
}) {
  if (!renewals.length || !plans) return null;
  return (
    <>
      {renewals.map((r) => (
        <RenewalCard key={r.id} renewal={r} plans={plans} />
      ))}
    </>
  );
}
