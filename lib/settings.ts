/**
 * Переключатели витрины, которые меняются из админки (/admin) без деплоя.
 * Хранятся в таблице `app_setting`; пока ключа нет — действует значение по
 * умолчанию, то есть поведение сайта до появления админки.
 */

import { getAppSettings, setAppSetting } from "./db";

export interface SiteSettings {
  /** Карточки «Фото» и «Видео» на странице цен. */
  showPerItemCards: boolean;
  /** Пополнение на произвольную сумму в модалке. Выкл — пакеты и своя сумма в узком диапазоне. */
  showCustomTopUp: boolean;
  /** Сервер принимает только пакеты и свою сумму в диапазоне PACK_MODE_TOPUP_RANGE. */
  blockCustomTopUp: boolean;
}

export type SettingKey = keyof SiteSettings;

export const SETTING_DEFAULTS: SiteSettings = {
  showPerItemCards: true,
  showCustomTopUp: true,
  blockCustomTopUp: false,
};

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === "string" && Object.hasOwn(SETTING_DEFAULTS, value);
}

export function getSiteSettings(): SiteSettings {
  const stored = getAppSettings();
  const settings = { ...SETTING_DEFAULTS };
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    if (stored[key] !== undefined) settings[key] = stored[key] === "1";
  }
  return settings;
}

export function setSiteSetting(key: SettingKey, value: boolean): void {
  setAppSetting(key, value ? "1" : "0");
}

/**
 * Показывать ли в модалке обычные суммы пополнения (иначе — режим пакетов).
 * При серверной блокировке — нет, даже если галочка показа включена: иначе
 * пользователь выберет сумму вне диапазона и получит ошибку.
 */
export function customTopUpVisible(settings: SiteSettings): boolean {
  return settings.showCustomTopUp && !settings.blockCustomTopUp;
}
