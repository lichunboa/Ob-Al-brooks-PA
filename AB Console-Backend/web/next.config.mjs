/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // 构建时忽略 ESLint 错误
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // 环境变量（构建时可用）
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // 图片优化配置
  images: {
    unoptimized: true, // Docker 环境下建议关闭
  },
  
  // 实验性功能
  experimental: {
    // 优化包体积
    optimizePackageImports: ['lucide-react'],
  },
  
  // 重写规则（API 代理）
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088'}/:path*`,
      },
      // Sync Service 代理
      {
        source: '/api/sync/:path*',
        destination: `${process.env.NEXT_PUBLIC_SYNC_API_URL || 'http://localhost:8089'}/api/v1/:path*`,
      },
    ];
  },
  
  // 响应头配置
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
