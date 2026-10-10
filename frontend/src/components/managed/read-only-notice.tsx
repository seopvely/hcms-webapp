import { ExternalLink, Info } from "lucide-react";

// 이관 기간 읽기 전용 안내. 쓰기는 cms 에서 하도록 같은 화면 링크를 준다.
export function ReadOnlyNotice({ cmsUrl }: { cmsUrl: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Info className="h-4 w-4 shrink-0" />
      <span>읽기 전용 기간입니다. 등록·처리는 cms 에서 해주세요.</span>
      <a href={cmsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
        cms 에서 열기 <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
