This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Хранилище файлов (SeaweedFS)

Загруженные изображения хранятся в SeaweedFS (S3-совместимое хранилище), поднятом в `docker-compose.yml`.

- Сервис `seaweedfs` — all-in-one (`weed server -s3`): master, volume, filer и S3 API.
- Данные — в docker volume `seaweedfs_data` (внутри контейнера `/data`).
- S3 API проброшен только на `127.0.0.1:${S3_PORT:-8333}`; master/filer/volume наружу не открываются.
- Внутри docker-сети приложение ходит на `http://seaweedfs:8333`.
- Учётные данные S3 задаются в `.env`: `S3_ACCESS_KEY`, `S3_SECRET_KEY` (шаблон — в `env.sample`).

### API

- `POST /api/uploads` — `multipart/form-data`, поле `file` (JPG/PNG/WebP, до 10 МБ). Требует авторизации, возвращает `{ key, url }`.
- `GET /api/files/[...key]` — отдаёт файл владельцу (проверка по префиксу `uploads/{userId}/`).

### Локальная разработка

```bash
docker compose up -d seaweedfs   # поднять только хранилище
bun dev                          # S3_ENDPOINT=http://localhost:8333 берётся из .env.local
```

### Бэкап

```bash
docker run --rm -v razdevator_seaweedfs_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/seaweedfs-backup.tar.gz -C /data .
```

## Несколько платёжек

Exenta остаётся в `env` (`PAYMENTS_*`) и на старом вебхуке `/api/payments/webhook`.
Дополнительные провайдеры — Cashera, Monee, ParityPay и следующие — подключаются в админке
`/adminlitgame43144/payments` и хранятся в БД (таблица `payment_provider`).
Метод оплаты у всех один — NSPK (СБП, `sbp`); в шаблон запроса подставляется
`{{paymentMethod}} = sbp`.

Секреты провайдеров лежат в БД. Если задать `PAYMENTS_CONFIG_KEY` (32 байта:
64 hex-символа или base64), они шифруются AES-256-GCM; без ключа хранятся как
есть, с предупреждением в логе. Поставили ключ — не меняйте и не убирайте его,
пока в базе есть зашифрованные секреты.

### Добавить провайдера

1. Открыть `/adminlitgame43144/payments` → «Добавить» и нажать пресет
   **Cashera**, **Monee** или **ParityPay**: заполнятся `baseUrl`, запросы,
   разбор ответа и статусы.
2. Ввести ключи из кабинета провайдера (в админке они видны только маской) и
   включить провайдера в списке.
3. Скопировать webhook URL из карточки провайдера —
   `${BETTER_AUTH_URL}/api/payments/webhook/<id>` — и вставить в кабинет
   провайдера. `BETTER_AUTH_URL` должен быть публичным HTTPS-адресом (обычно
   порт 443): внешние провайдеры не принимают `callback_url` на localhost.
   Служебные события вроде `webhook.test` и чужие типы (выплаты, подписки)
   подтверждаются `2xx` и не трогают баланс — в пресете Cashera для этого
   заданы `eventPath` и `events`. Подписи и выплаты ParityPay в пресет не
   входят: интеграция только приём платежей NSPK.
4. Для локальной разработки можно разрешить `http://` в `baseUrl` через
   `PAYMENT_PROVIDER_ALLOW_HTTP=1`; на проде — только `https://`.

### Monee

- В пресете заполнены создание счёта (`/v2/order/create`), информация о счёте
  (`/v2/order/info`) и проверка вебхука.
- `merchantId` — это **shop UUID** из кабинета Monee; он подставляется в
  `shop_to`/`shop_uuid`. Публичный API-ключ Monee не нужен: запросы
  подписываются `X-Sign` секретным ключом, его указывают в поле `apiSecret`.
- Перед включением провайдера включите в кабинете Monee метод
  **«СБП (РФ) [QR]» (`sbp`)** на вкладке «Методы оплаты». Если метод выключен,
  `/v2/order/create` вернёт `400 Payment method is disabled`.
- Вебхук проверяется по `signature` (sha256 тела без `signature` + секрет) и
  `shop_id`; сумма перечитывается из `/order/info`, потому что в вебхуке она
  в рублях, а в info — в копейках.
- `retries=0`: у Monee нет idempotency-key, повтор запроса создаёт второй счёт.
- Monee рекомендует дополнительно ограничить IP вебхука. В приложении
  проверяются подпись и `shop_id`; IP-allowlist пока не настроен.

### ParityPay

- Пресет уже содержит создание счёта (`POST /v2/invoice/create`), статус
  (`GET /v2/invoice/status?id={{uuid}}`) и проверку вебхука.
- Касса определяется заголовками: `X-ShopId` = `merchantId` (shop UUID),
  `X-SecretKey` = секретный ключ №1. В админке ключ №1 вводится в поле
  **apiKey**, ключ №2 (подпись вебхука) — в поле **apiSecret**.
- Суммы ParityPay принимает и отдаёт decimal-рублями, поэтому в пресете
  `amountMultiplier=1`, а в теле используется `{{amountRub}}` (рубли с
  копейками). Внутри приложения и в сверке суммы остаются в копейках:
  адаптер нормализует их по `amountMultiplier`.
- Вебхук проверяется по заголовку `X-SIGNATURE`: HMAC-SHA256 от строки из
  значений полей в порядке сортировки ключей, без разделителей, на ключ №2;
  дополнительно сверяется `shop_id` с `merchantId`. Событие `REFUNDED`
  помечается `IGNORE` — баланс не меняется.
- `retries=0`: `order_id` уникален в рамках кассы, повтор создания счёта
  возвращает `422 Order id is not unique`.
- Ограничение провайдера — 60 запросов в минуту с одного IP. Приём платежей
  по подпискам и выплаты не реализованы (в пресет не входят).

### Активный провайдер и фолбэк

- Активный провайдер выбирается для «Сайт» и отдельно для каждого проекта из
  `GATEWAY_PROJECTS`; пустой выбор проекта наследует сайтовый. Если не выбрано
  ничего, для сайта берётся Exenta (когда настроена), иначе первый доступный.
- Фолбэк включён по умолчанию: если активный не выставил счёт, пробуем
  следующих доступных по `sortOrder`. Выключили — используется только активный.
- Настройки хранятся в `app_setting` и читаются на каждый запрос — переключение
  действует сразу, без рестарта.
- Провайдера нельзя удалить, только выключить. Старые счета не ломаются: у
  `payment` и `gateway_payment` сохраняется `providerId`, а сверка и вебхуки
  ищут счёт по паре `(providerId, providerUuid)`. Выключенные провайдеры
  остаются доступны для сверки уже выставленных счетов.
- `payment_provider` — конфиги провайдеров (секреты запечатаны);
  `payment_event` — журнал вебхуков: уникальная пара `providerId` + `eventId`
  защищает от повторной обработки, а `IGNORE`/`MISMATCH` помогают разбирать
  возвраты и расхождения. Схема — в `docker/schema.sql`.
