import { redirect } from "next/navigation";

/**
 * Старый адрес страницы возврата собственного пополнения (ссылки в уже
 * выставленных счетах Exenta). Ведём на единый `/pay/<id>` — там сессия
 * владельца проверится на месте.
 */
export default async function LegacyPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/pay/${encodeURIComponent(id)}`);
}
