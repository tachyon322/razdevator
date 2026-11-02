/**
 * Создание счетов для сайта и внешнего шлюза с фолбэком по цепочке
 * провайдеров. Черновик платежа создаётся один раз (нужен id для адреса
 * возврата); провайдер фиксируется в платеже после успешного создания счёта.
 */

import {
  attachGatewayProvider,
  attachProviderPayment,
  createGatewayPayment,
  createPayment,
  getPayment,
  setGatewayPaymentStatus,
  setPaymentStatus,
  type GatewayPayment,
  type GatewayPaymentStatus,
  type Payment,
  type PaymentStatus,
} from "./db";
import type { GatewayProject } from "./gateway";
import { applyGatewayProviderStatus } from "./gateway-payments";
import {
  NSPK_PAYMENT_METHOD,
  getAdapter,
  type ProviderDeps,
  type ResolvedProvider,
} from "./payment-provider";
import {
  parseRequisites,
  serializeRequisites,
  type PaymentRequisites,
} from "./payment-requisites";
import { resolveProviderChain } from "./payment-settings";

export class NoProviderError extends Error {
  constructor(message = "Нет доступных платёжных провайдеров") {
    super(message);
    this.name = "NoProviderError";
  }
}

export interface ProviderChainFailure {
  providerId: string;
  error: unknown;
}

export class ProviderChainError extends Error {
  readonly failures: ProviderChainFailure[];

  constructor(failures: ProviderChainFailure[]) {
    super(
      failures.length > 0
        ? `Все платёжные провайдеры отказали: ${failures
            .map(({ providerId, error }) => `${providerId}: ${describe(error)}`)
            .join("; ")}`
        : "Все платёжные провайдеры отказали",
    );
    this.name = "ProviderChainError";
    this.failures = failures;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** H2H-провайдер отдаёт реквизиты в ответе, а не ссылку на свою страницу. */
export function isH2hProvider(provider: ResolvedProvider): boolean {
  return Boolean(provider.config?.response.requisites);
}

function toGatewayStatus(status: PaymentStatus): Exclude<GatewayPaymentStatus, "PAID"> {
  switch (status) {
    case "SUCCESS":
      // Успех проводит только сверка/вебхук, но счёт уже считается созданным.
      return "PENDING";
    case "CANCELLED":
      return "CANCELED";
    default:
      return status;
  }
}

export interface CreateSiteInvoiceInput {
  userId: string;
  amountRub: number;
  creditRub: number;
  packId: string | null;
  buyerIp: string | null;
  siteUrl: string;
}

export interface CreateSiteInvoiceResult {
  payment: Payment;
  /** У H2H-провайдера — наша страница `/pay/<id>`, на ней показаны реквизиты. */
  redirectUrl: string;
  providerId: string;
  /** H2H: реквизиты для оплаты; null — оплата на странице провайдера. */
  requisites: PaymentRequisites | null;
}

/**
 * Счёт на пополнение сайта. Пробует провайдеров по цепочке; успех первого
 * фиксируется в платеже. Если не вышло ни у кого — платёж FAILED.
 */
export async function createSiteInvoice(
  input: CreateSiteInvoiceInput,
  deps: ProviderDeps = {},
): Promise<CreateSiteInvoiceResult> {
  const chain = resolveProviderChain({ service: "site" });
  if (chain.providers.length === 0) {
    throw new NoProviderError();
  }

  const payment = createPayment({
    userId: input.userId,
    amountRub: input.amountRub,
    creditRub: input.creditRub,
    packId: input.packId,
  });
  const returnPageUrl = `${input.siteUrl}/pay/${payment.id}`;
  const failures: ProviderChainFailure[] = [];

  for (const provider of chain.providers) {
    let invoice;
    try {
      invoice = await getAdapter(provider, deps).createInvoice({
        amountRub: input.amountRub,
        description: "Пополнение баланса neuromatic",
        externalId: payment.id,
        callbackUrl: `${input.siteUrl}/api/payments/webhook/${provider.id}`,
        successUrl: returnPageUrl,
        failUrl: returnPageUrl,
        buyerIp: input.buyerIp,
        paymentMethod: NSPK_PAYMENT_METHOD,
      });
    } catch (error) {
      failures.push({ providerId: provider.id, error });
      console.warn(
        `[payments] ${provider.id} не создал счёт ${payment.id}: ${describe(error)}`,
      );
      continue;
    }

    attachProviderPayment(payment.id, {
      providerId: provider.id,
      providerUuid: invoice.providerUuid,
      status: invoice.status === "SUCCESS" ? "PENDING" : invoice.status,
      providerStatus: invoice.rawStatus,
      requisites: serializeRequisites(invoice.requisites),
    });
    console.info(
      `[payments] счёт ${payment.id} на ${input.amountRub} ₽ создан через ${provider.id}`,
    );
    return {
      payment: getPayment(payment.id) as Payment,
      redirectUrl: invoice.redirectUrl || returnPageUrl,
      providerId: provider.id,
      requisites: invoice.requisites ?? null,
    };
  }

  setPaymentStatus(payment.id, "FAILED");
  throw new ProviderChainError(failures);
}

export interface CreateGatewayInvoiceInput {
  project: GatewayProject;
  externalId: string;
  externalUserId: string | null;
  purpose: string | null;
  method: string | null;
  amountRub: number;
  returnUrl: string | null;
  buyerIp: string | null;
  siteUrl: string;
  /**
   * Проект умеет показывать реквизиты у себя (H2H). Без флага H2H-провайдеры
   * пропускаются: у проекта нет страницы, на которой их показать.
   */
  h2h?: boolean;
}

export interface CreateGatewayInvoiceResult {
  payment: GatewayPayment;
  redirectUrl: string;
  providerId: string;
  requisites: PaymentRequisites | null;
}

/**
 * Счёт по заказу внешнего проекта. Метод оплаты всегда NSPK: поле `method`
 * проекта сохраняем для его аналитики, но провайдеру передаём только NSPK.
 */
export async function createGatewayInvoice(
  input: CreateGatewayInvoiceInput,
  deps: ProviderDeps = {},
): Promise<CreateGatewayInvoiceResult> {
  const resolved = resolveProviderChain({
    service: "project",
    projectId: input.project.id,
  });
  const providers = input.h2h
    ? resolved.providers
    : resolved.providers.filter((provider) => !isH2hProvider(provider));
  if (providers.length < resolved.providers.length) {
    console.warn(
      `[gateway] проект ${input.project.id} не поддерживает H2H: пропущены ${resolved.providers
        .filter(isH2hProvider)
        .map((provider) => provider.id)
        .join(", ")}`,
    );
  }
  if (providers.length === 0) {
    throw new NoProviderError();
  }

  if (
    input.method &&
    input.method.toLowerCase() !== NSPK_PAYMENT_METHOD &&
    input.method.toLowerCase() !== "nspk"
  ) {
    console.warn(
      `[gateway] проект ${input.project.id} передал method=${input.method}; поддерживается только NSPK`,
    );
  }

  const payment = createGatewayPayment({
    projectId: input.project.id,
    externalId: input.externalId,
    externalUserId: input.externalUserId,
    purpose: input.purpose,
    method: input.method,
    amountRub: input.amountRub,
    returnUrl: input.returnUrl,
    buyerIp: input.buyerIp,
  });
  const returnPageUrl = `${input.siteUrl}/pay/${payment.id}`;
  const failures: ProviderChainFailure[] = [];

  for (const provider of providers) {
    let invoice;
    try {
      invoice = await getAdapter(provider, deps).createInvoice({
        amountRub: input.amountRub,
        description: input.project.description,
        externalId: payment.id,
        callbackUrl: `${input.siteUrl}/api/payments/webhook/${provider.id}`,
        successUrl: returnPageUrl,
        failUrl: returnPageUrl,
        buyerIp: input.buyerIp,
        paymentMethod: NSPK_PAYMENT_METHOD,
      });
    } catch (error) {
      failures.push({ providerId: provider.id, error });
      console.warn(
        `[gateway] ${provider.id} не создал счёт ${payment.id}: ${describe(error)}`,
      );
      continue;
    }

    const attached = attachGatewayProvider(payment.id, {
      providerId: provider.id,
      providerUuid: invoice.providerUuid,
      redirectUrl: invoice.redirectUrl || returnPageUrl,
      requisites: serializeRequisites(invoice.requisites),
      status: toGatewayStatus(invoice.status),
      providerStatus: invoice.rawStatus,
    });
    const fresh = applyGatewayProviderStatus(attached, {
      providerUuid: invoice.providerUuid,
      status: invoice.status,
      rawStatus: invoice.rawStatus,
      amount: invoice.amount,
      currency: invoice.currency,
    });
    console.info(
      `[gateway] счёт ${fresh.id} проекта ${input.project.id} на ${input.amountRub} ₽ создан через ${provider.id}: ${fresh.status}`,
    );
    return {
      payment: fresh,
      redirectUrl: fresh.redirectUrl ?? (invoice.redirectUrl || returnPageUrl),
      providerId: provider.id,
      requisites: parseRequisites(fresh.requisites),
    };
  }

  setGatewayPaymentStatus(payment.id, "FAILED");
  throw new ProviderChainError(failures);
}
