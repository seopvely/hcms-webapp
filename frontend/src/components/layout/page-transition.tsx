"use client";
import { cn } from "@/lib/utils";

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out",
        className
      )}
    >
      {children}
    </div>
  );
}
