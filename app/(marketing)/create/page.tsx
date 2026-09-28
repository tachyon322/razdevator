import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserUsage } from "@/lib/db";
import { TRIAL } from "@/lib/plans";
import { PhotoStudio } from "../../components/create/PhotoStudio";

export const metadata = {
  title: "Студия — Раздеватор",
  description:
    "Загрузите фото, выберите стиль и получите готовый 18+ кадр или видео. Приватно и без публикации.",
};

export default async function CreatePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=/create");

  const usage = getUserUsage(session.user.id);
  const used = usage?.generationsUsed ?? 0;
  const left = Math.max(TRIAL.limit - used, 0);
  const balance = usage?.balanceRub ?? 0;

  return (
    <main className="flex-1 py-10 sm:py-14">
      <div className="container-page">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Студия
            </h1>
            <p className="mt-3 max-w-xl text-muted">
              Загрузите фото, выберите образ — и получите готовый 18+ кадр.
            </p>
          </div>

          <PhotoStudio
            planName={TRIAL.name}
            left={left}
            limit={TRIAL.limit}
            balance={balance}
          />
        </div>
      </div>
    </main>
  );
}
