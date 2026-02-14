import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.CAPACITOR_BUILD === 'true'
    ? { output: 'export' }
    : {}),

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/:path*',
      },
      {
        source: '/auth/:path*',
        destination: 'http://127.0.0.1:8000/auth/:path*',
      },
    ];
  },
};

export default nextConfig;
