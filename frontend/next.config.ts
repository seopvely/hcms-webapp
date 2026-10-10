import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.CAPACITOR_BUILD === 'true'
    ? { output: 'export' }
    : {}),

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
