"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface PageSpinnerProps {
  show?: boolean;
  className?: string;
}

export function PageSpinner({ show = true, className }: PageSpinnerProps) {
  if (!show) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-300",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">로딩 중...</p>
      </div>
    </div>
  );
}
