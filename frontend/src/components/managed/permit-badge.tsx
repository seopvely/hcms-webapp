import { Badge } from "@/components/ui/badge";
import type { CustomerManager } from "@/lib/staff-content";

export function PermitBadge({ m }: { m: CustomerManager }) {
  if (!m.has_password) return <Badge className="bg-slate-100 text-slate-600">비밀번호 미설정</Badge>;
  if (m.login_permit_tf === "2") return <Badge className="bg-red-100 text-red-700">차단·잠김</Badge>;
  if (m.login_permit_tf === "0") return <Badge className="bg-amber-100 text-amber-700">허용 안 함(구 코드 0)</Badge>;
  if (m.login_permit_tf !== "1") return <Badge className="bg-amber-100 text-amber-700">미설정</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700">로그인 허용</Badge>;
}
