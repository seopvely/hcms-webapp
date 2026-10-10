import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.CAPACITOR_BUILD === 'true'
    ? { output: 'export' }
    : {}),

  // cms(/managed) 옛 경로 → hcms 새 경로. 메일·북마크 링크 호환(SPEC 부록A). 정적 export(앱) 빌드에서는 무시된다.
  async redirects() {
    return [
      { source: "/managed/main", destination: "/managed", permanent: false },
      { source: "/managed/managelist", destination: "/managed/maintenance", permanent: false },
      { source: "/managed/managelist_detail/:id", destination: "/managed/maintenance/:id", permanent: false },
      { source: "/managed/managelist_register", destination: "/managed/maintenance/new", permanent: false },
      { source: "/managed/maintenance-schedule", destination: "/managed/maintenance/schedule", permanent: false },
      { source: "/managed/pointdeduct", destination: "/managed/points", permanent: false },
      { source: "/managed/point-guide", destination: "/managed/points/guide", permanent: false },
      { source: "/managed/history", destination: "/managed/maintenance/comments", permanent: false },
      { source: "/managed/agent", destination: "/managed/staff", permanent: false },
    ];
  },

  // dev 전용: 운영은 nginx 가 /api 를 백엔드로 직접 보낸다.
  // 백엔드 라우터가 /api prefix 를 가지므로 경로를 그대로 넘긴다.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:9011/api/:path*',
      },
    ];
  },
};

export default nextConfig;
