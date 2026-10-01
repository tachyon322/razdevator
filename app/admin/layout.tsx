import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Админка — Раздеватор",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
