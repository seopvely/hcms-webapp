"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/app-toast";
import { Field, apiErrorDetail } from "@/components/managed/field";

export const COMPANY_FIELDS: [string, string][] = [
  ["name", "업체명"], ["ceoname", "대표자"], ["business_number", "사업자번호"], ["phone_number", "전화"],
  ["ceo_phone_number", "대표 연락처"], ["fax_number", "팩스"], ["ceo_email", "대표 이메일"], ["tax_email", "세금계산서 이메일"],
  ["post_number", "우편번호"], ["address", "주소"], ["address_de", "상세주소"],
];

// 텍스트 필드 몇 개를 고치는 저장 다이얼로그(업체·고객 계정 등)
export function EditDialog({
  title, fields, initial, note, onClose, onSave,
}: {
  title: string;
  fields: [string, string][];
  initial: Record<string, string>;
  note?: string;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(values);
      toast("success", "저장했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([k, label]) => (
            <Field key={k} label={label}>
              <Input className="rounded-xl" value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <DialogFooter>
          <Button className="rounded-xl" onClick={save} disabled={saving}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
