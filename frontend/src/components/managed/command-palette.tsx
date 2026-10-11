"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, ExternalLink, History, LayoutGrid, Plus, Search, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STAFF_NAV } from "@/components/managed/staff-nav";

/** 다른 곳(사이드바 버튼 등)에서 팔레트를 열 때 */
export const OPEN_COMMAND_PALETTE = "hcms:open-command-palette";
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE));

interface Command {
  id: string;
  label: string;
  group: string;
  kind: "menu" | "action";
  keywords?: string;
  href?: string;
  external?: boolean; // 새 탭
  run?: () => void;
}

// 메뉴 외에 바로 실행할 수 있는 동작(새로 만들기 등)
const ACTIONS: { label: string; href: string; keywords?: string }[] = [
  { label: "새 유지보수 요청 등록", href: "/managed/maintenance/new", keywords: "유지보수 등록 작성" },
  { label: "새 건별작업 등록", href: "/managed/tasks/new", keywords: "작업 등록" },
  { label: "새 영업접수 등록", href: "/managed/sales/new", keywords: "영업 리드 등록" },
  { label: "새 계약서 작성", href: "/managed/contracts/new", keywords: "계약 등록" },
  { label: "새 프로젝트 등록", href: "/managed/projects/new", keywords: "프로젝트 등록" },
  { label: "새 미팅약속 등록", href: "/managed/meetings/new", keywords: "미팅 일정 등록" },
  { label: "새 할일 등록", href: "/managed/todos/new", keywords: "할일 todo 등록" },
  { label: "새 최신소식 작성", href: "/managed/news/new", keywords: "소식 공지 등록" },
  { label: "새 구축게시판 글쓰기", href: "/managed/project-board/new", keywords: "게시판 글 등록" },
  { label: "2단계 인증 등록", href: "/managed/mfa-setup", keywords: "otp 인증앱 보안" },
];

const RECENT_KEY = "hcms_cmdk_recent";
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 한글 초성 문자열(예: 유지보수 → ㅇㅈㅂㅅ) */
function chosung(s: string): string {
  return Array.from(s).map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
  }).join("");
}

/** 점수: 0 = 불일치. 앞부분 일치·연속 일치를 우선한다. */
function score(cmd: Command, q: string): number {
  const text = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ""}`.toLowerCase();
  const label = cmd.label.toLowerCase();
  const query = q.toLowerCase().replace(/\s+/g, "");
  if (!query) return 1;
  if (label.startsWith(query)) return 100;
  if (label.replace(/\s+/g, "").includes(query)) return 80;
  if (text.replace(/\s+/g, "").includes(query)) return 60;
  if (/^[ㄱ-ㅎ]+$/.test(query) && chosung(text.replace(/\s+/g, "")).includes(query)) return 50;
  // 글자 순서대로 흩어져 있어도 일치(예: "견대" → 견적 대시보드)
  let i = 0;
  for (const ch of text) if (ch === query[i]) i++;
  return i === query.length ? 20 : 0;
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 5)));
  } catch {
    // 저장소를 쓸 수 없는 환경
  }
}

/** 직원 화면 명령 팔레트 — ⌘K / Ctrl+K 로 메뉴 이름을 검색해 이동·실행한다. */
export function CommandPalette({ isAdmin, onLogout }: { isAdmin: boolean; onLogout: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const menus: Command[] = STAFF_NAV.flatMap((g) =>
      g.items.filter((i) => !i.adminOnly || isAdmin).map((i) => ({
        id: `menu:${i.href}`, label: i.label, group: g.title, kind: "menu" as const, href: i.href, external: i.legacy || i.newTab,
      })),
    );
    const actions: Command[] = ACTIONS.map((a) => ({ id: `action:${a.href}`, label: a.label, group: "바로 실행", kind: "action", href: a.href, keywords: a.keywords }));
    return [...menus, ...actions, { id: "action:logout", label: "로그아웃", group: "바로 실행", kind: "action", keywords: "logout 종료", run: onLogout }];
  }, [isAdmin, onLogout]);

  const results = useMemo(() => {
    if (!q.trim()) {
      const byId = new Map(commands.map((c) => [c.id, c]));
      const rec = recent.map((id) => byId.get(id)).filter(Boolean).map((c) => ({ ...c!, group: "최근 사용" }));
      return [...rec, ...commands.filter((c) => !recent.includes(c.id))];
    }
    return commands.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
  }, [q, commands, recent]);

  const show = useCallback(() => {
    setQ("");
    setActive(0);
    setRecent(readRecent());
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE, show);
    };
  }, [open, show]);

  // 선택 항목이 보이도록 스크롤
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const execute = (cmd: Command | undefined, newTab = false) => {
    if (!cmd) return;
    pushRecent(cmd.id);
    setOpen(false);
    if (cmd.run) return cmd.run();
    if (!cmd.href) return;
    if (cmd.external || newTab) window.open(cmd.href, "_blank", "noopener,noreferrer");
    else router.push(cmd.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      execute(results[active], e.metaKey || e.ctrlKey);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">메뉴 검색</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onInputKey}
            placeholder="메뉴 이름 검색 (초성 가능: ㅇㅈㅂㅅ)"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">&ldquo;{q}&rdquo; 에 맞는 메뉴가 없습니다.</p>}
          {results.map((c, i) => {
            const header = i === 0 || results[i - 1].group !== c.group ? c.group : null;
            const Icon = c.group === "최근 사용" ? History : c.kind === "action" ? (c.run ? Zap : Plus) : LayoutGrid;
            return (
              <div key={`${c.group}-${c.id}`}>
                {header && <p className="px-2 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground">{header}</p>}
                <button
                  data-idx={i}
                  onMouseMove={() => setActive(i)}
                  onClick={(e) => execute(c, e.metaKey || e.ctrlKey)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm", i === active ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100" : "hover:bg-muted/50")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {q.trim() && c.group !== "바로 실행" && <span className="text-xs text-muted-foreground">{c.group}</span>}
                  {c.external && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span><kbd className="font-sans">↑↓</kbd> 이동</span>
          <span><kbd className="font-sans">Enter</kbd> 열기</span>
          <span><kbd className="font-sans">⌘/Ctrl+Enter</kbd> 새 탭</span>
          <span><kbd className="font-sans">⌘/Ctrl+K</kbd> 열기·닫기</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
