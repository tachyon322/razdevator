import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { AGE_GATE_INIT_SCRIPT, AgeGate } from "./components/AgeGate";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Раздеватор — AI-фото 18+",
  description:
    "Приватный AI-сервис: превращаем ваши фото в 18+ кадры. Только для совершеннолетних.",
};

export const viewport: Viewport = {
  themeColor: "#0a090b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      // Атрибут data-age-verified ставит инлайн-скрипт до гидратации.
      suppressHydrationWarning
      className={`${manrope.variable} ${unbounded.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <script
          dangerouslySetInnerHTML={{ __html: AGE_GATE_INIT_SCRIPT }}
        />
        {children}
        <AgeGate />
      </body>
    </html>
  );
}
