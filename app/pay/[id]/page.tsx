import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getGatewayPayment, getPayment, paymentCreditRub } from "@/lib/db";
import { findPack } from "@/lib/plans";
import { PaymentStatus } from "../../components/PaymentStatus";
import { GatewayReturn } from "../../components/GatewayReturn";

export const metadata: Metadata = {
  title: "Оплата",
  // Перекрываем описание сайта: страницу открывают по ссылке из мессенджеров,
  // в превью не должно быть брендов и текстов основного проекта.
  description: "Страница оплаты",
  robots: { index: false, follow: false },
};

/**
 * Единый адрес возврата после оплаты (`/pay/<id>`) — и для счетов внешних
 * проектов, и для собственных пополнений. Ссылка обязана открываться у любого:
 * владелец счёта видит привычный статус пополнения, все остальные (покупатель
 * внешнего проекта, чужой или вышедший пользователь) — нейтральную заглушку без
 * данных и ссылок. Ни 404, ни редиректа на вход: счёт из кабинета провайдера
 * можно открыть в любом браузере.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const gatewayPayment = getGatewayPayment(id);
  if (gatewayPayment) {
    return (
      <Shell>
        <GatewayReturn />
        <Wordmark />
      </Shell>
    );
  }

  const payment = getPayment(id);
  if (!payment) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  const mine = Boolean(session && payment.userId === session.user.id);

  return (
    <Shell>
      {mine ? (
        <PaymentStatus
          id={payment.id}
          amountRub={payment.amountRub}
          creditRub={paymentCreditRub(payment)}
          packName={findPack(payment.packId)?.name ?? null}
          initialStatus={payment.status}
        />
      ) : (
        <GatewayReturn />
      )}
      <Wordmark />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function Wordmark() {
  return (
    <p className="mt-6 text-center text-xs font-semibold tracking-[0.2em] text-muted uppercase">
      neuromatic
    </p>
  );
}
