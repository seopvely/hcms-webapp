"use client";

// HCMS 데스크탑 앱(macOS) 설치 페이지 — 로그인 없이 연다.
// 주소(/desktop/download)는 데스크탑 앱 config/domains.json 의 desktop.downloadUrl, public/open.html·desktop-banner.js 의
// DOWNLOAD_URL 과 같아야 한다. 파일은 서버 DESKTOP_RELEASE_DIR 에 올리고 /api/public/desktop/releases 가 칩별 최신 DMG 를 알려준다.
import { useEffect, useState } from "react";
import { Cpu, Download, Laptop, Terminal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface DesktopRelease {
  name: string;
  version: string;
  size: number;
  url: string;
}

type Releases = { arm64: DesktopRelease | null; x64: DesktopRelease | null };

const INSTALL_COMMAND = 'bash "/Volumes/HCMS 설치/HCMS 설치.command"';

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

function DownloadButton({ label, hint, release, loading }: { label: string; hint: string; release: DesktopRelease | null | undefined; loading: boolean }) {
  if (!release) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center">
        <p className="font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{loading ? "확인 중…" : "설치 파일 준비 중입니다."}</p>
      </div>
    );
  }
  return (
    <a
      href={release.url}
      className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-4 text-white shadow-md transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#667eea]"
    >
      <Download className="h-6 w-6 flex-none" />
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-white/80">
          {hint} · v{release.version} · {formatSize(release.size)}
        </span>
      </span>
    </a>
  );
}

export default function DesktopDownloadPage() {
  const [releases, setReleases] = useState<Releases | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/public/desktop/releases")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setReleases)
      .catch(() => setFailed(true));
  }, []);

  const loading = !releases && !failed;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="relative mx-auto max-w-xl py-8">
        <Card className="overflow-hidden rounded-3xl border-0 shadow-2xl">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] px-6 py-10 text-center text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Laptop className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">HCMS 데스크탑 앱</h1>
            <p className="mt-1 text-sm text-white/80">macOS 전용 · 알림을 받고 연동 사이트를 바로 엽니다</p>
          </div>

          <CardContent className="space-y-6 p-6">
            <section className="space-y-3">
              <h2 className="text-base font-semibold">1. Mac 칩에 맞는 파일을 받으세요</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <DownloadButton label="Apple 칩" hint="M1 이후" release={releases?.arm64} loading={loading} />
                <DownloadButton label="Intel 칩" hint="2020년 이전 Mac" release={releases?.x64} loading={loading} />
              </div>
              {failed && <p className="text-sm text-red-600">설치 파일 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>}
              <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <Cpu className="mt-0.5 h-4 w-4 flex-none" />
                <span>
                  칩 종류는 화면 왼쪽 위 <b>Apple 메뉴 → 이 Mac에 관하여</b> 의 <b>칩</b> 항목에서 확인합니다. &quot;Apple M…&quot; 이면 Apple 칩,
                  &quot;프로세서 … Intel&quot; 이면 Intel 칩입니다.
                </span>
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold">2. 설치</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>받은 DMG 파일을 더블클릭해 엽니다.</li>
                <li>
                  <b>터미널</b>(응용 프로그램 → 유틸리티)을 열고 아래 명령을 붙여 넣은 뒤 Enter 를 누릅니다.
                </li>
                <li>설치가 끝나면 응용 프로그램 폴더의 HCMS 를 실행하고 로그인합니다.</li>
              </ol>
              <div className="flex items-start gap-2 rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100">
                <Terminal className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
                <code className="select-all break-all">{INSTALL_COMMAND}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                정식 서명 전 내부 배포판이라 Finder 에서 바로 열면 macOS 가 실행을 막습니다. 위 명령으로 설치해 주세요.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
