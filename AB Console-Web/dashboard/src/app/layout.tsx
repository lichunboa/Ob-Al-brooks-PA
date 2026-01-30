import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AB Console - 交易员控制台',
  description: 'Al Brooks 价格行为交易系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
