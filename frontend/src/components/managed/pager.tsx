import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pager({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>총 {total.toLocaleString()}건</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="rounded-xl" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button size="sm" variant="outline" className="rounded-xl" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
