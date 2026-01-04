import type { NextConfig } from "next";

const API_PROXY_TARGET = process.env.BACKEND_PROXY_TARGET || "http://localhost:8081";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_BASE_URL === "/api") {
      return [
        {
          source: "/api/:path*",
          destination: `${API_PROXY_TARGET}/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
