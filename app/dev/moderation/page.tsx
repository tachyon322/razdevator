import { notFound } from "next/navigation";
import { ModerationTester } from "./ModerationTester";

export const metadata = {
  title: "Стенд возрастных ворот",
  robots: { index: false, follow: false },
};

/**
 * Локальная страница для подбора параметров проверки фото: свои пороги,
 * промпты и модель. Живёт только в dev — в собранном проде её нет.
 */
export default function DevModerationPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ModerationTester />;
}
