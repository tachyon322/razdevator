import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { NEW_PROVIDER_VALUES } from "../form-values";
import { ProviderForm } from "../ProviderForm";

export const dynamic = "force-dynamic";

const EMPTY_MASKS = { apiKey: "", apiSecret: "" };

export default async function NewPaymentProviderPage() {
  await requireAdmin();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Новый провайдер
          </h1>
          <p className="mt-2 text-sm text-muted">
            Универсальный HTTP-провайдер: шаблоны запросов, разбор ответа и вебхука.
            Кнопки пресетов «Cashera» и «Monee» заполнят конфиг; секреты, а для Monee
            ещё merchantId (shop UUID), укажите свои.
          </p>
        </div>
        <Link
          href="/adminlitgame43144/payments"
          className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
        >
          ← К платежам
        </Link>
      </div>

      <ProviderForm
        providerId={null}
        initial={NEW_PROVIDER_VALUES}
        initialEnabled
        secretMasks={EMPTY_MASKS}
      />
    </>
  );
}
