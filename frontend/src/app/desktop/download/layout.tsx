import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HCMS 데스크탑 앱 설치",
  description: "HCMS 데스크탑 앱(macOS) 설치 파일",
};

export default function DesktopDownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
