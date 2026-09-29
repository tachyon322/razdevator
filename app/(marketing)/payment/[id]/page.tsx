import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPayment } from "@/lib/db";
import { PaymentStatus } from "../../../components/PaymentStatus";

export const metadata = {
  title: "Оплата — Раздеватор",
  robots: { index: false },
};

/** Сюда Exenta возвращает покупателя после оплаты (успешной или нет). */
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/login?next=/payment/${encodeURIComponent(id)}`);

  const payment = getPayment(id);
  if (!payment || payment.userId !== session.user.id) notFound();

  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page max-w-lg">
        <PaymentStatus
          id={payment.id}
          amountRub={payment.amountRub}
          initialStatus={payment.status}
        />
      </div>
    </main>
  );
}
