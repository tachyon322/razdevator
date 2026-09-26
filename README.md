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
