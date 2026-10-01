import { redirect } from "next/navigation";

/**
 * Старый адрес страницы возврата (ссылки в уже выставленных счетах Exenta).
 * Ничего не рендерим — сразу переводим покупателя на актуальный `/pay/<id>`,
 * чтобы он не видел маркетинговую обвязку сайта.
 */
export default async function LegacyGatewayReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const query = t ? `?t=${encodeURIComponent(t)}` : "";
  redirect(`/pay/${encodeURIComponent(id)}${query}`);
}
