"use client";

import { useEffect, useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PageSpinner } from "@/components/common/page-spinner";
import api from "@/lib/axios";

type ApiError = { response?: { data?: { detail?: string } } };
interface ContractView {
  contract_number: string;
  contract_title: string;
  party_a_name: string;
  party_b_name: string;
  contract_amount: number | null;
  status_label: string;
  can_sign: boolean;
  customer_signed_at: string | null;
  customer_signed_name: string | null;
}

// 고객 계약서 열람·서명(로그인 불필요). 메일 링크 /contract-sign#token=… (구 cms 링크는 ?token= 으로 넘어온다)
export default function ContractSignPage() {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<ContractView | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedHash, setSignedHash] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token") || new URLSearchParams(window.location.search).get("token");
    window.history.replaceState(null, "", "/contract-sign");
    if (!t) {
      setError("링크가 올바르지 않습니다.");
      return;
    }
    setToken(t);
    api.post("/public/contracts/view", { token: t })
      .then((r) => setView(r.data))
      .catch((err: ApiError) => setError(err.response?.data?.detail || "계약서를 열 수 없습니다."));
    api.post("/public/contracts/pdf", { token: t }, { responseType: "blob" })
      .then((r) => setPdfUrl(URL.createObjectURL(r.data)))
      .catch(() => undefined);
  }, []);

  const sign = async () => {
    setBusy(true);
    try {
      const r = await api.post("/public/contracts/sign", { token, signer_name: name, agree });
      setSignedHash(r.data.hash);
      setView((v) => (v ? { ...v, can_sign: false, status_label: "서명완료", customer_signed_name: name, customer_signed_at: r.data.signed_at } : v));
    } catch (err) {
      setError((err as ApiError).response?.data?.detail || "서명에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!view && !error) return <PageSpinner />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
          <div className="flex items-center gap-2 text-sm text-white/80"><FileSignature className="h-4 w-4" /> 전자 계약서</div>
          {view && <h1 className="mt-1 text-lg font-bold">{view.contract_title}</h1>}
          {view && <p className="mt-1 text-xs text-white/80">{view.contract_number} · 갑 {view.party_a_name} · 을 {view.party_b_name} · {view.status_label}</p>}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {pdfUrl && <iframe src={pdfUrl} title="계약서" className="h-[70vh] w-full rounded-2xl border bg-white" />}
        {view && (
          <Card className="rounded-2xl">
            <CardContent className="space-y-3 pt-5 pb-5 text-sm">
              {view.can_sign ? (
                <>
                  <p>계약서 내용을 확인한 뒤 서명자 이름을 입력하고 서명해 주세요. 서명 시각·IP·계약 본문으로 만든 인증값이 함께 기록됩니다.</p>
                  <Input className="h-12 max-w-sm rounded-xl" placeholder="서명자 이름" value={name} onChange={(e) => setName(e.target.value)} />
                  <label className="flex items-center gap-2"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} /> 계약 내용을 확인했으며 이에 동의합니다.</label>
                  <Button className="h-12 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2]" disabled={!name.trim() || !agree || busy} onClick={sign}>
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "서명하기"}
                  </Button>
                </>
              ) : (
                <p>
                  {view.customer_signed_name ? `${view.customer_signed_name} 님이 서명했습니다.` : "서명할 수 없는 상태의 계약서입니다."}
                  {signedHash && <span className="mt-1 block break-all text-xs text-muted-foreground">인증값 {signedHash}</span>}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
