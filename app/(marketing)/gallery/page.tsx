import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listGenerations } from "@/lib/db";
import { toGenerationDTO } from "@/lib/generation-dto";
import { GalleryClient } from "@/app/components/gallery/GalleryClient";
import { DemoGallery } from "@/app/components/gallery/DemoGallery";
import { GridIcon } from "@/app/components/icons";

export const metadata = {
  title: "Галерея — Раздеватор",
  description:
    "Ваши кадры и видео, созданные в Студии. Приватно и только для вас.",
};

export default async function GalleryPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return <DemoGallery />;
  }

  const generations = listGenerations(session.user.id, { limit: 200 });

  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-muted">
            <GridIcon className="size-4 text-brand" />
            Личная галерея
          </span>

          <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Ваши работы
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            Все созданные кадры и видео хранятся здесь. Доступ есть только у
            вас — файлы раздаются с проверкой владельца.
          </p>
        </div>

        <div className="mt-10">
          <GalleryClient initial={generations.map(toGenerationDTO)} />
        </div>
      </div>
    </main>
  );
}
