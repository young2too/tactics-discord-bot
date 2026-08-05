import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TACTICS — 실시간 마피아 전술전",
  description: "스킬을 선택하고, 대상을 지정하고, 적의 정체를 밝혀내는 실시간 소셜 전술 게임",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
