"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StepUpDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (password: string) => void;
}

// 민감 작업(포인트 실행·삭제·요청유형 변경) 전 본인 비밀번호 재확인.
export function StepUpDialog({ open, title, description, confirmText = "확인", pending, onOpenChange, onConfirm }: StepUpDialogProps) {
  const [password, setPassword] = useState("");
  const close = (next: boolean) => {
    if (!next) setPassword("");
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password) onConfirm(password);
          }}
          className="space-y-4"
        >
          <Input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="본인 비밀번호"
            className="rounded-xl"
          />
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => close(false)}>
              취소
            </Button>
            <Button type="submit" className="rounded-xl" disabled={!password || pending}>
              {confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
