import "./globals.css";

export const metadata = {
  title: "AB Patrol Web",
  description: "AB Patrol-Agent runtime dashboard and trading console",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
