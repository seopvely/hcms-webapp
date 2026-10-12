"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  ImagePlus,
  List,
  ListOrdered,
  Loader2,
} from "lucide-react";
import api from "@/lib/axios";
import staffApi from "@/lib/staff-api";

interface SimpleEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** 본문 이미지 업로드 — 고객 화면은 "customer", 직원 화면은 "staff". 없으면 이미지 버튼을 숨긴다. */
  imageUpload?: "customer" | "staff";
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_MB = 10;

/** 이미지 1장을 올리고 공개 주소를 받는다(서버가 검사·EXIF 제거·축소). */
async function uploadImage(target: "customer" | "staff", file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const client = target === "staff" ? staffApi : api;
  const url = target === "staff" ? "/managed/editor-images" : "/editor-images";
  const res = await client.post(url, form, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data.url as string;
}

export function SimpleEditor({
  value,
  onChange,
  placeholder = "내용을 입력해주세요",
  className,
  imageUpload,
}: SimpleEditorProps) {
  const [uploading, setUploading] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const targetRef = useRef(imageUpload);
  useEffect(() => {
    targetRef.current = imageUpload;
  }, [imageUpload]);

  // 고른·붙여넣은·끌어다 놓은 이미지를 차례로 올려 커서(또는 놓은) 위치에 넣는다. 아래에 설명을 이어 쓸 수 있게 빈 문단을 둔다.
  const insertImages = async (ed: Editor, files: File[], pos?: number) => {
    const target = targetRef.current;
    if (!target) return;
    const images = files.filter((f) => IMAGE_TYPES.includes(f.type));
    if (!images.length) {
      setImageError("JPG·PNG·GIF·WEBP 이미지만 넣을 수 있습니다.");
      return;
    }
    setImageError(null);
    for (const file of images) {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        setImageError(`${file.name}: ${MAX_IMAGE_MB}MB 를 넘습니다.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const src = await uploadImage(target, file);
        const chain = ed.chain().focus();
        if (pos !== undefined) chain.insertContentAt(pos, [{ type: "image", attrs: { src, alt: file.name } }, { type: "paragraph" }]);
        else chain.insertContent([{ type: "image", attrs: { src, alt: file.name } }, { type: "paragraph" }]);
        chain.run();
        pos = undefined; // 두 번째부터는 앞 이미지 뒤(현재 커서)에 붙인다
      } catch (err) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setImageError(`${file.name}: ${typeof detail === "string" ? detail : "업로드에 실패했습니다."}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "editor-image" } }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "p-3 min-h-[200px] prose prose-sm max-w-none focus:outline-none",
      },
      // 붙여넣기·끌어다 놓기 이미지 — 이미지 업로드를 켠 화면만. base64 로 본문에 박히지 않게 기본 동작을 막는다.
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length || !targetRef.current || !editorRef.current) return false;
        event.preventDefault();
        void insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (moved || !files.length || !targetRef.current || !editorRef.current) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void insertImages(editorRef.current, files, at?.pos);
        return true;
      },
    },
  });
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive,
    children,
    title,
  }: {
    onClick: () => void;
    isActive: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div
      className={`border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 ${className ?? ""}`}
    >
      {/* Toolbar */}
      <div className="flex gap-1 p-2 border-b bg-muted/30">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          isActive={editor.isActive("heading", { level: 2 })}
          title="제목"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <div className="w-px bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="목록"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 목록"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        {imageUpload && (
          <>
            <div className="w-px bg-border mx-1" />
            <ToolbarButton onClick={() => fileInput.current?.click()} isActive={false} title="이미지 넣기 (붙여넣기·끌어다 놓기도 됩니다)">
              {uploading > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            </ToolbarButton>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void insertImages(editor, files);
              }}
            />
            {uploading > 0 && <span className="self-center text-xs text-muted-foreground">이미지 올리는 중…</span>}
          </>
        )}
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
      {imageError && <p className="border-t bg-red-50 px-3 py-1.5 text-xs text-red-700">{imageError}</p>}

      {/* Placeholder styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }
        .tiptap img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 0.5rem 0; }
        .tiptap img.ProseMirror-selectednode { outline: 2px solid hsl(var(--ring, 220 90% 56%)); }
      `}} />
    </div>
  );
}
