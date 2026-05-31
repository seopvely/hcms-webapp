import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
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
    alert(`[DEBUG] Filesystem 오류: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  try {
    await Share.share({
      title: filename,
      files: [savedFile.uri],
      dialogTitle: `${filename} 열기`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Share canceled") return;
    alert(`[DEBUG] Share 오류: ${error instanceof Error ? error.message : String(error)}\nURI: ${savedFile.uri}`);
    throw error;
  }
}
