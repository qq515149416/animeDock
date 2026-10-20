import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
// 日期和默认星期在每次请求时计算，避免静态构建日期跨天后失效。
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  icons: { icon: "/icon.svg" },
  title: { default: "番剧坞 · 每日放送与动画探索", template: "%s · 番剧坞" },
  description:
    "每日放送、动画库与懂你的 AI 番剧助手。基于 Bangumi 开放数据，发现下一部心动的番剧。",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F1115",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
