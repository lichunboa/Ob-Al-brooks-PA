/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8088"}/:path*`,
      },
      {
        source: "/api/sync/:path*",
        destination: `${process.env.NEXT_PUBLIC_SYNC_API_URL || "http://localhost:8089"}/api/v1/:path*`,
      },
      {
        source: "/api/execution/:path*",
        destination: `${process.env.NEXT_PUBLIC_EXECUTION_API_URL || "http://localhost:8092"}/:path*`,
      },
      {
        source: "/api/vis/:path*",
        destination: `${process.env.NEXT_PUBLIC_VIS_API_URL || "http://localhost:8087"}/:path*`,
      },
      {
        source: "/api/backtest/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKTEST_API_URL || "http://localhost:8093"}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
        ],
      },
    ];
  },
  devIndicators: {
    buildActivityPosition: "bottom-right",
  },
};

export default nextConfig;
