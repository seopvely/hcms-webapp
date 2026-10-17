// 직원 프로젝트 메모 API (/api/managed/project-memos)
import { useMutation } from "@tanstack/react-query";
import staffApi from "@/lib/staff-api";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import type { Paged } from "@/lib/staff-maintenance";

export interface MemoFile {
  id: number;
  filename: string;
  url: string;
  is_image: boolean;
  /** 이미지 AI 분석: null(이미지 아님) · pending · done · edited(직원이 고침) · failed · skipped(credential) */
  extract_status: "pending" | "done" | "edited" | "failed" | "skipped" | null;
  /** 이미지 설명(한두 문장) */
  extract_summary: string | null;
  /** 글자가 주된 이미지면 옮겨 적은 글자 */
  extracted_text: string | null;
}

export interface ProjectMemo {
  seq: number;
  memo_type: string;
  type_label: string;
  /** AI(haiku)가 본문에서 뽑은 제목. pending 이면 규칙 제목(첫 줄 등)이 임시로 들어 있다 */
  title: string;
  title_status: "pending" | "ai" | "auto";
  /** credential 은 목록에서 null(masked=true) — reveal 로 연다 */
  content: string | null;
  masked: boolean;
  memo_date: string | null;
  /** 해야할일 완료 체크 */
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  projects: { seq: number; title: string | null; company_name: string | null }[];
  attachments: MemoFile[];
  /** 제목 생성·이미지 분석 중 */
  ai_pending: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MemoType {
  value: string;
  label: string;
  count?: number;
}

export type MemoList = Paged<ProjectMemo> & { types: MemoType[]; write_enabled: boolean };
export type MemoContext = { items: ProjectMemo[]; scope: "project" | "company"; types: MemoType[]; write_enabled: boolean };

/** 날짜 칸을 기본으로 펼치는 유형 */
export const DATED_TYPES = new Set(["date", "payment_day", "minutes", "todo"]);
/** 본문을 고정폭으로 보여 주는 유형 */
export const MONO_TYPES = new Set(["credential", "prompt", "md"]);

// 제목을 뽑거나 이미지를 분석하는 중인 메모가 있으면 3초마다 다시 읽는다
const pollPending = (d: { items: ProjectMemo[] } | undefined) => (d?.items.some((m) => m.ai_pending) ? 3000 : false);

export function useMemoList(params: Record<string, unknown>) {
  return useStaffGet<MemoList>(["project-memos", "list"], "/project-memos", params, { refetchInterval: pollPending });
}

export type MemoProject = { seq: number; title: string; company_id: number | null; company_name: string | null; count: number };

/** 메모가 연결된 프로젝트(메모 수) — 목록 화면 프로젝트 색인 */
export function useMemoProjects() {
  return useStaffGet<{ items: MemoProject[]; unlinked: number; total: number }>(["project-memos", "projects"], "/project-memos/projects");
}

export function useMemoContext(projectId: number | null | undefined, companyId: number | null | undefined) {
  const params = projectId ? { project_id: projectId } : { company_id: companyId };
  return useStaffGet<MemoContext>(["project-memos", "context"], projectId || companyId ? "/project-memos/context" : null, params, { refetchInterval: pollPending });
}

export function useMemoWrite() {
  return useStaffWrite(["project-memos"]);
}

/** credential 본문 열기(서버에 감사 로그가 남는다) */
export function useMemoReveal() {
  return useMutation({
    mutationFn: async (seq: number): Promise<string> => (await staffApi.post(`/managed/project-memos/${seq}/reveal`, {})).data.content ?? "",
  });
}
