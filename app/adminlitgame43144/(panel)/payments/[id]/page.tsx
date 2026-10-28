import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getPaymentProviderRow } from "@/lib/db";
import { providerWebhookUrl, publicBaseIsHttps, publicBaseUrl } from "@/lib/site-url";
import { CopyButton } from "../CopyButton";
import { storedProviderForm } from "../form-values";
import { ProviderForm } from "../ProviderForm";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

export default async function EditPaymentProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const row = getPaymentProviderRow(id);
  if (!row) notFound();

  const form = storedProviderForm(row);
  const webhookUrl = providerWebhookUrl(row.id);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Провайдер: {row.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            id <code className="font-mono text-xs text-faint">{row.id}</code> · обновлён{" "}
            {formatDate(row.updatedAt)}
          </p>
        </div>
        <Link
          href="/adminlitgame43144/payments"
          className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
        >
          ← К платежам
        </Link>
      </div>

      <div className="mt-4 flex max-w-3xl flex-wrap items-center gap-3 rounded-card border border-line bg-panel p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">
            URL вебхука — его нужно указать в кабинете провайдера
          </p>
          <p className="mt-1 break-all font-mono text-xs text-ink">{webhookUrl}</p>
        </div>
        <CopyButton text={webhookUrl} />
      </div>

      {!publicBaseIsHttps() && (
        <p className="mt-2 max-w-3xl text-xs leading-5 text-brand">
          BETTER_AUTH_URL сейчас {publicBaseUrl()} — внешний провайдер может отклонить
          callback_url и вебхук. Для продакшена нужен публичный https-адрес.
        </p>
      )}

      <ProviderForm
        providerId={row.id}
        initial={form.values}
        initialEnabled={form.enabled}
        secretMasks={form.masks}
      />
    </>
  );
}
