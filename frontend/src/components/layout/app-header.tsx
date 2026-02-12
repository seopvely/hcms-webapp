"use client";
import { Menu, Bell } from "lucide-react";
import { useNavigationStore } from "@/store/navigation-store";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const { setSidebarOpen, pageTitle } = useNavigationStore();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between h-14 px-4",
        "bg-background/80 backdrop-blur-md border-b border-border/50"
      )}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl hover:bg-accent lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold truncate">{pageTitle}</h2>
      </div>
      <button className="p-2 rounded-xl hover:bg-accent relative">
        <Bell className="h-5 w-5" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
      </button>
    </header>
  );
}
