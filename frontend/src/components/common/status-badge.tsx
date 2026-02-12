import { cn } from "@/lib/utils";

type BadgeVariant = { label: string; className: string };

const maintenanceStatusMap: Record<string, BadgeVariant> = {
  "1": { label: "접수", className: "bg-gray-100 text-gray-700" },
  "2": { label: "알림", className: "bg-blue-100 text-blue-700" },
  "3": { label: "처리중", className: "bg-amber-100 text-amber-700" },
  "4": { label: "완료", className: "bg-emerald-100 text-emerald-700" },
};

const taskStatusMap: Record<string, BadgeVariant> = {
  "1": { label: "대기", className: "bg-gray-100 text-gray-700" },
  "2": { label: "진행중", className: "bg-blue-100 text-blue-700" },
  "3": { label: "완료", className: "bg-emerald-100 text-emerald-700" },
  "4": { label: "보류", className: "bg-amber-100 text-amber-700" },
};

const estimateStatusMap: Record<string, BadgeVariant> = {
  "1": { label: "작성중", className: "bg-gray-100 text-gray-700" },
  "2": { label: "제출", className: "bg-blue-100 text-blue-700" },
  "3": { label: "승인", className: "bg-emerald-100 text-emerald-700" },
  "4": { label: "반려", className: "bg-red-100 text-red-700" },
  "5": { label: "계약전환", className: "bg-purple-100 text-purple-700" },
};

const statusMaps = {
  maintenance: maintenanceStatusMap,
  task: taskStatusMap,
  estimate: estimateStatusMap,
};

interface StatusBadgeProps {
  status: string;
  type: keyof typeof statusMaps;
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const map = statusMaps[type];
  const variant = map[status] || {
    label: status,
    className: "bg-gray-100 text-gray-600",
  };

  // Show pulse dot for in-progress statuses (maintenance: 알림/처리중, task: 진행중)
  const showPulse =
    (type === "maintenance" && (status === "2" || status === "3")) ||
    (type === "task" && status === "2");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant.className,
        className
      )}
    >
      {showPulse && (
        <span className="relative flex h-2 w-2 mr-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {variant.label}
    </span>
  );
}
