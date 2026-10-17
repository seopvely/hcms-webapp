"use client";
import { useEffect } from "react";
import { PAGE_ACTIONS_ID } from "@/components/managed/staff-header";

const TEXT_INPUT = 'input:not([type]), input[type="text"], input[type="search"]';

/** Alt+F — 목록 화면의 검색 입력창에 커서를 둔다.
 * 목록마다 검색창 마크업이 달라 표시 하나를 일일이 달지 않고, 본문(main)의 돋보기 아이콘(lucide-search)이 속한
 * 검색 폼(없으면 아이콘을 감싼 요소)의 첫 텍스트 입력을 찾는다. 모바일에서 접힌 필터처럼 안 보이는 입력은 건너뛴다. */
function focusListSearch(): boolean {
  const main = document.querySelector("main");
  if (!main) return false;
  for (const icon of main.querySelectorAll("svg.lucide-search")) {
    const scope = icon.closest("form") ?? icon.parentElement;
    const input = [...(scope?.querySelectorAll<HTMLInputElement>(TEXT_INPUT) ?? [])].find(
      (el) => !el.disabled && el.getClientRects().length > 0,
    );
    if (input) {
      input.focus();
      input.select();
      return true;
    }
  }
  return false;
}

/** Alt+N — 목록의 등록 화면(<현재 경로>/new)으로 간다.
 * 화면에 그려진 등록 링크를 눌러 이동한다 — 쓰기 권한이 없어 버튼이 숨은 목록에선 아무 일도 하지 않는다. */
function openListNew(): boolean {
  const target = `${location.pathname.replace(/\/$/, "")}/new`;
  const link = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
    (a) => new URL(a.href).pathname === target && a.getClientRects().length > 0,
  );
  link?.click();
  return !!link;
}

const FORM_CONTROL = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="submit"]):not([type="button"])',
  "select", "textarea", '[contenteditable="true"]', "button[data-search-select]",
].join(", ");

/** Alt+W — 쓰기 화면의 첫 입력칸·선택칸에 커서를 둔다.
 * 등록·수정 폼이 따로 경로 없이 화면 상태로 바뀌기도 해서 경로로 가리지 않고, 열린 대화상자가 있으면 그 안, 없으면 본문(main)에서
 * 처음 보이는 입력을 찾는다. 목록 검색창(Alt+F 대상)은 건너뛴다. */
function focusFirstField(): boolean {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length > 0);
  const scope = dialogs.at(-1) ?? document.querySelector("main");
  if (!scope) return false;
  const searchScopes = [...scope.querySelectorAll("svg.lucide-search")]
    .map((icon) => icon.closest("form") ?? icon.parentElement)
    .filter((el): el is HTMLElement => !!el && !el.matches("button"));
  const field = [...scope.querySelectorAll<HTMLElement>(FORM_CONTROL)].find(
    (el) => !(el as HTMLInputElement).disabled && el.getClientRects().length > 0 && !searchScopes.some((s) => s.contains(el)),
  );
  field?.focus();
  return !!field;
}

const PILL = ":is(a, button).rounded-full.px-3.py-1";
const isShown = (el: Element) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0;

/** Alt+T(뒤로는 Alt+Shift+T) — 목록 위쪽 알약 탭을 차례로 옮겨 간다.
 * 본문에서 처음 보이는 알약이 속한 묶음(같은 부모)을 대상으로, 켜진 알약(bg-slate-900) 다음 것을 눌러 이동·필터한다. 끝에서 처음으로 돈다. */
function cycleTopPills(back: boolean): boolean {
  const first = [...(document.querySelector("main")?.querySelectorAll(PILL) ?? [])].find(isShown);
  if (!first?.parentElement) return false;
  const pills = [...first.parentElement.querySelectorAll<HTMLElement>(`:scope > ${PILL}`)].filter(isShown);
  const active = pills.findIndex((el) => el.classList.contains("bg-slate-900"));
  const next = active < 0 ? 0 : (active + (back ? -1 : 1) + pills.length) % pills.length;
  pills[next]?.click();
  return pills.length > 0;
}

/** Alt+E — 상세 화면의 "수정" 버튼(연필 아이콘 + "수정" 글자)을 눌러 수정 화면으로 바꾼다.
 * 상단바 버튼 자리(PageActions)를 먼저, 그다음 본문을 본다. 글자 없는 행별 연필 버튼(담당자 수정 등)은 대상이 아니다.
 * 수정 권한이 없거나 수정할 수 없는 상태라 버튼이 없으면 아무 일도 하지 않는다. */
function openEdit(): boolean {
  const scopes = [document.getElementById(PAGE_ACTIONS_ID), document.querySelector("main")];
  for (const scope of scopes) {
    const button = [...(scope?.querySelectorAll<HTMLElement>("button, a") ?? [])].find(
      (el) => !!el.querySelector("svg.lucide-pencil") && el.textContent?.includes("수정") && isShown(el),
    );
    if (button) {
      button.click();
      return true;
    }
  }
  return false;
}

/** Alt+S 가 누르는 저장 버튼 글자 — 앞에 있을수록 먼저 고른다.
 * 계약서는 상태를 넘기지 않는 "작성중 저장"을 고른다(검토대기 전환은 직접 누른다). */
const SAVE_LABELS = ["저장", "확정 저장", "작성중 저장", "견적서 만들기"];
/** 등록·추가는 상세 화면의 댓글 등록 같은 버튼과 겹쳐 새로 만들기 화면(/new)과 대화상자에서만 고른다. */
const CREATE_LABELS = ["등록", "추가"];

/** Alt+S — 수정·등록 화면의 저장 버튼을 누른다. 열린 대화상자가 있으면 그 안, 없으면 상단바 버튼 자리와 본문에서 찾는다.
 * 버튼을 그대로 누르므로 필수값이 비어 버튼이 꺼져 있으면 아무 일도 하지 않는다. */
function clickSave(): boolean {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length > 0).at(-1);
  const scopes = dialog ? [dialog] : [document.getElementById(PAGE_ACTIONS_ID), document.querySelector("main")];
  const labels = dialog || location.pathname.endsWith("/new") ? [...SAVE_LABELS, ...CREATE_LABELS] : SAVE_LABELS;
  const buttons = scopes.flatMap((scope) => [...(scope?.querySelectorAll<HTMLButtonElement>("button") ?? [])]).filter(isShown);
  const label = (b: HTMLElement) => b.textContent?.replace(/\s+/g, " ").trim() ?? "";
  for (const want of labels) {
    const button = buttons.find((b) => label(b) === want);
    if (button) {
      button.click();
      return true;
    }
  }
  return false;
}

/** Alt+L — 상세·등록 화면에서 상위 목록으로 돌아간다.
 * 상단바 경로 표시(그룹 › 메뉴 › 상세)의 마지막 링크가 그 목록이다 — 목록 화면에선 메뉴가 마지막이라 링크가 없어 아무 일도 하지 않는다.
 * 모바일에선 경로 표시가 숨겨지지만 링크는 그대로 눌린다. */
function backToList(): boolean {
  const link = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="경로"] a[href]')].at(-1);
  link?.click();
  return !!link;
}

/** 단축키 안내(명령 팔레트의 "ShortCut Info") — 단축키를 바꾸면 여기도 고친다. 맥에선 Alt 대신 ⌥(Option). */
export const HOTKEY_HELP: { keys: string; label: string; where: string }[] = [
  { keys: "⌘/Ctrl+K", label: "메뉴 검색(퀵메뉴) 열기·닫기", where: "모든 화면" },
  { keys: "Alt+F", label: "검색창에 커서", where: "목록" },
  { keys: "Alt+N", label: "등록 화면으로 이동", where: "목록(등록 버튼이 있을 때)" },
  { keys: "Alt+T", label: "상단 알약 탭 다음으로 (Alt+Shift+T 이전)", where: "목록" },
  { keys: "Alt+E", label: "수정 화면으로 전환", where: "상세(수정 버튼이 있을 때)" },
  { keys: "Alt+L", label: "목록으로 돌아가기", where: "상세·등록 화면" },
  { keys: "Alt+W", label: "첫 입력칸·선택칸에 커서", where: "등록·수정 화면, 대화상자" },
  { keys: "Alt+S", label: "저장 (새로 만들기·대화상자에선 등록·추가도)", where: "등록·수정 화면, 대화상자" },
];

/** 직원 화면 단축키. e.code 로 비교한다 — 한글 입력 중엔 e.key 가 "ㄹ"·"ㅜ"·"ㅈ"·"ㅅ"·"ㄷ"·"ㄴ"·"ㅣ", 맥에선 "ƒ"·"˜"·"∑"·"†"·"´"·"ß"·"¬" 가 된다. */
const HOTKEYS: Record<string, () => boolean> = { KeyF: focusListSearch, KeyN: openListNew, KeyW: focusFirstField, KeyE: openEdit, KeyS: clickSave, KeyL: backToList };

export function ListHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyT") {
        if (cycleTopPills(e.shiftKey)) e.preventDefault();
        return;
      }
      const action = e.shiftKey ? undefined : HOTKEYS[e.code];
      const handled = action ? action() : false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
