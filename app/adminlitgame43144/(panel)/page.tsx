import { requireAdmin } from "@/lib/admin";
import { getSiteSettings, type SettingKey } from "@/lib/settings";
import { SettingToggle } from "./SettingToggle";

const SETTINGS: { key: SettingKey; title: string; description: string }[] = [
  {
    key: "showPerItemCards",
    title: "Карточки «Фото» и «Видео» на странице цен",
    description: "Выключено — на /pricing остаются только пакеты.",
  },
  {
    key: "showCustomTopUp",
    title: "Пополнение на произвольную сумму",
    description:
      "Выключено — в модалке пополнения вместо сумм показываются только пакеты.",
  },
  {
    key: "blockCustomTopUp",
    title: "Блокировать произвольные суммы на сервере",
    description:
      "Включено — сервер отклоняет пополнение на сумму, даже если запрос отправлен в обход интерфейса. Покупка пакетов работает. Пока блокировка включена, модалка показывает только пакеты независимо от галочки выше.",
  },
];

export default async function AdminShowcasePage() {
  await requireAdmin();
  const settings = getSiteSettings();

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Витрина
      </h1>
      <p className="mt-2 text-sm text-muted">
        Изменения применяются сразу, без перезапуска.
      </p>

      <ul className="mt-6 flex max-w-3xl flex-col gap-3">
        {SETTINGS.map((setting) => (
          <li
            key={setting.key}
            className="flex items-start justify-between gap-4 rounded-card border border-line bg-panel p-5"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">{setting.title}</h2>
              <p className="mt-1 text-xs leading-5 text-muted">{setting.description}</p>
            </div>
            <SettingToggle
              settingKey={setting.key}
              checked={settings[setting.key]}
              label={setting.title}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
