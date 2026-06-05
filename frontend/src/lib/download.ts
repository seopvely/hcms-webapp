import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function isShareCanceled(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("share canceled") ||
    msg.includes("canceled") ||
    msg.includes("cancelled") ||
    msg.includes("activity was canceled") ||
    msg.includes("activity was cancelled") ||
    msg.includes("no share targets")
  );
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 200);
    return;
  }

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  let savedFile: Awaited<ReturnType<typeof Filesystem.writeFile>>;
  try {
    savedFile = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });
  } catch (error) {
    console.error("[download] Filesystem 오류:", error);
    throw new Error("파일 저장에 실패했습니다.");
  }

  try {
    await Share.share({
      title: filename,
      files: [savedFile.uri],
      dialogTitle: `${filename} 열기`,
    });
  } catch (error) {
    if (isShareCanceled(error)) return;
    console.error("[download] Share 오류:", error);
    throw new Error("파일 공유에 실패했습니다.");
  } finally {
    if (Capacitor.getPlatform() === "ios") {
      // iOS에서 Share 시트가 닫힌 후 WebView 터치 이벤트가 비활성화되는
      // 문제를 방지하기 위해 포인터 이벤트를 강제로 초기화한다.
      document.documentElement.style.pointerEvents = "none";
      setTimeout(() => {
        document.documentElement.style.pointerEvents = "";
      }, 50);
    }
  }
}
