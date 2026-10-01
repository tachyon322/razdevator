import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGatewayPayment } from "@/lib/db";
import { getGatewayProject, verifyReturnToken } from "@/lib/gateway";
import { GatewayReturn } from "../../components/GatewayReturn";

export const metadata: Metadata = {
  title: "Оплата",
  // Перекрываем описание сайта: страницу открывают по ссылке из мессенджеров,
  // в превью не должно быть брендов и текстов основного проекта.
  description: "Страница оплаты",
  robots: { index: false, follow: false },
};

/**
 * Адрес возврата покупателя после оплаты: сюда Exenta переводит вкладку, в
 * счёте указан только наш домен. Страница ничего не показывает и никуда не
 * ведёт — ни статуса, ни ссылок на проект: покупатель возвращается в своё
 * приложение сам, а статус живёт там. Доступ по токену в `?t=…`.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = t ?? "";

  const payment = getGatewayPayment(id);
  const project = payment ? getGatewayProject(payment.projectId) : null;
  if (!payment || !project || !verifyReturnToken(project.secret, payment.id, token)) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <GatewayReturn />
        <p className="mt-6 text-center text-xs font-semibold tracking-[0.2em] text-muted uppercase">
          neuromatic
        </p>
      </div>
    </main>
  );
}
