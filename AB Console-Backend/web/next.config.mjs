/**
 * @type {import('next').NextConfig}
 * 
 * 本地开发局域网访问配置
 * 
 * 允许同一WiFi下的设备访问开发服务器
 */
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
    unoptimized: true,
  },
  
  // 实验性功能
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // 允许远程访问开发服务器 (Next.js 14+)
    // 注意：这会放宽安全限制，仅在受信任网络使用
  },
  
  // 重写规则（API 代理）
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088'}/:path*`,
      },
      {
        source: '/api/sync/:path*',
        destination: `${process.env.NEXT_PUBLIC_SYNC_API_URL || 'http://localhost:8089'}/api/v1/:path*`,
      },
    ];
  },
  
  // 响应头配置 - 放宽 CORS 限制
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
        ],
      },
    ];
  },
  
  // 开发服务器配置
  devIndicators: {
    buildActivityPosition: 'bottom-right',
  },
};

export default nextConfig;
