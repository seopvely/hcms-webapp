"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PAGE_ACTIONS_ID } from "@/components/managed/staff-header";

/** 화면의 주요 버튼(새로 만들기·PDF 등)을 상단바 오른쪽에 둔다. 모바일에서도 상단바에 보인다. */
export function PageActions({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // 상단바가 먼저 그려진 뒤에 붙인다
    const id = requestAnimationFrame(() => setTarget(document.getElementById(PAGE_ACTIONS_ID)));
    return () => cancelAnimationFrame(id);
  }, []);
  return target ? createPortal(children, target) : null;
}
