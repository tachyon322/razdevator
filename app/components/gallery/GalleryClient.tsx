"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CloseIcon,
  DownloadIcon,
  HeartIcon,
  ImageIcon,
  RefreshIcon,
  TrashIcon,
} from "@/app/components/icons";
import type {
  GenerationDTO,
  GenerationSummaryDTO,
} from "@/lib/generation-dto";
import { GALLERY_PAGE_SIZE } from "@/lib/pagination";

type Tab = "all" | "image" | "video" | "favorite";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "image", label: "Фото" },
  { id: "video", label: "Видео" },
  { id: "favorite", label: "Избранное" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function primaryAsset(item: GenerationSummaryDTO) {
  return item.assets[0] ?? null;
}

export function GalleryClient({
  initial,
  initialCursor,
}: {
  initial: GenerationSummaryDTO[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [tab, setTab] = useState<Tab>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [prompts, setPrompts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    if (tab === "favorite") return items.filter((item) => item.favorite);
    return items.filter((item) => item.kind === tab);
  }, [items, tab]);

  const open = items.find((item) => item.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Промпт догружается отдельно и кешируется, чтобы список оставался лёгким.
  useEffect(() => {
    if (!openId || prompts[openId] !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/generations/${openId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as GenerationDTO;
        if (cancelled) return;
        setPrompts((prev) => ({ ...prev, [openId]: data.prompt }));
      } catch {
        // промпт просто не покажется
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openId, prompts]);

  const firstPage = useCallback(async () => {
    const res = await fetch(`/api/generations?limit=${GALLERY_PAGE_SIZE}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      generations: GenerationSummaryDTO[];
      nextCursor: string | null;
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const data = await firstPage();
      if (data) {
        setItems(data.generations);
        setCursor(data.nextCursor);
        setPrompts({});
      }
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/generations?limit=${GALLERY_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        generations: GenerationSummaryDTO[];
        nextCursor: string | null;
      };
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [
          ...prev,
          ...data.generations.filter((item) => !seen.has(item.id)),
        ];
      });
      setCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleFavorite = async (item: GenerationSummaryDTO) => {
    const next = !item.favorite;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, favorite: next } : it)),
    );
    try {
      await fetch(`/api/generations/${item.id}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
    } catch {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, favorite: !next } : it,
        ),
      );
    }
  };

  const remove = async (item: GenerationSummaryDTO) => {
    if (!window.confirm("Удалить генерацию? Действие необратимо.")) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/generations/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setOpenId(null);
      }
    } finally {
      setBusyId(null);
    }
  };

  const download = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // игнорируем
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={[
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors",
                tab === item.id
                  ? "bg-brand text-white"
                  : "border border-line-strong text-muted hover:bg-panel-hover hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:opacity-60 sm:self-auto"
        >
          <RefreshIcon
            className={["size-4", refreshing ? "animate-spin" : ""].join(" ")}
          />
          Обновить
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {filtered.map((item) => (
            <GalleryCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onOpen={() => setOpenId(item.id)}
              onFavorite={() => toggleFavorite(item)}
            />
          ))}
        </div>
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mx-auto inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover disabled:opacity-60"
        >
          {loadingMore && <RefreshIcon className="size-4 animate-spin" />}
          Показать ещё
        </button>
      )}

      {open && (
        <Lightbox
          item={open}
          prompt={prompts[open.id] ?? null}
          busy={busyId === open.id}
          onClose={() => setOpenId(null)}
          onFavorite={() => toggleFavorite(open)}
          onDelete={() => remove(open)}
          onDownload={download}
        />
      )}
    </div>
  );
}

function GalleryCard({
  item,
  busy,
  onOpen,
  onFavorite,
}: {
  item: GenerationSummaryDTO;
  busy: boolean;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  const asset = primaryAsset(item);
  const pending = item.status === "pending" || item.status === "processing";

  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-card border border-line bg-panel">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="group relative block w-full"
      >
        {asset ? (
          asset.kind === "video" ? (
            <video
              src={asset.url}
              muted
              playsInline
              preload="metadata"
              className="aspect-[3/4] w-full bg-black object-cover"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={asset.url}
              alt=""
              loading="lazy"
              className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          )
        ) : (
          <span className="grid aspect-[3/4] w-full place-items-center bg-elevated text-faint">
            {pending ? (
              <RefreshIcon className="size-6 animate-spin" />
            ) : (
              <ImageIcon className="size-6" />
            )}
          </span>
        )}

        <span className="absolute left-3 top-3 rounded-full border border-line-strong bg-canvas/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink backdrop-blur">
          {item.kind === "video" ? "Видео" : "Фото"}
        </span>

        {item.status === "failed" ? (
          <span className="absolute right-3 top-3 rounded-full border border-brand/40 bg-brand-soft px-2.5 py-1 text-[10px] font-semibold text-ink backdrop-blur">
            Ошибка
          </span>
        ) : pending ? (
          <span className="absolute right-3 top-3 rounded-full border border-line-strong bg-canvas/70 px-2.5 py-1 text-[10px] font-semibold text-ink backdrop-blur">
            В работе
          </span>
        ) : null}
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
        <span className="text-xs text-faint">{formatDate(item.createdAt)}</span>
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={item.favorite}
          aria-label="В избранное"
          className={[
            "grid size-8 place-items-center rounded-full transition-colors",
            item.favorite
              ? "text-brand"
              : "text-faint hover:bg-panel-hover hover:text-ink",
          ].join(" ")}
        >
          <HeartIcon
            className="size-4"
            fill={item.favorite ? "currentColor" : "none"}
          />
        </button>
      </div>
    </div>
  );
}

function Lightbox({
  item,
  prompt,
  busy,
  onClose,
  onFavorite,
  onDelete,
  onDownload,
}: {
  item: GenerationSummaryDTO;
  prompt: string | null;
  busy: boolean;
  onClose: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onDownload: (url: string, filename: string) => void;
}) {
  const asset = primaryAsset(item);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-canvas/85 p-4 backdrop-blur"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line bg-panel"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {item.kind === "video" ? "Видео" : "Фото"}
            </span>
            <span className="text-xs text-faint">
              {formatDate(item.createdAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-ink"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-elevated">
          {asset ? (
            asset.kind === "video" ? (
              <video
                src={asset.url}
                controls
                autoPlay
                playsInline
                className="mx-auto max-h-[60vh] w-full bg-black object-contain"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={asset.url}
                alt=""
                className="mx-auto max-h-[60vh] w-full object-contain"
              />
            )
          ) : (
            <p className="p-8 text-center text-sm text-muted">
              {item.status === "failed"
                ? item.error ?? "Генерация завершилась ошибкой."
                : "Результат ещё готовится."}
            </p>
          )}
        </div>

        {prompt && (
          <p className="max-h-24 overflow-auto border-t border-line px-4 py-3 text-xs leading-relaxed text-faint">
            {prompt}
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-line p-4">
          {asset && (
            <button
              type="button"
              onClick={() =>
                onDownload(
                  asset.url,
                  `razdevator-${item.id}.${asset.kind === "video" ? "mp4" : "jpg"}`,
                )
              }
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              <DownloadIcon className="size-4" />
              Скачать
            </button>
          )}
          <button
            type="button"
            onClick={onFavorite}
            aria-pressed={item.favorite}
            className={[
              "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-colors",
              item.favorite
                ? "border-brand bg-brand-soft text-brand"
                : "border-line-strong text-ink hover:bg-panel-hover",
            ].join(" ")}
          >
            <HeartIcon
              className="size-4"
              fill={item.favorite ? "currentColor" : "none"}
            />
            {item.favorite ? "В избранном" : "В избранное"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Удалить"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-muted transition-colors hover:bg-panel-hover hover:text-ink disabled:opacity-60"
          >
            <TrashIcon className="size-4" />
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const isFavorites = tab === "favorite";
  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-panel px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
        <ImageIcon className="size-6" />
      </span>
      <div>
        <p className="font-display text-lg font-bold text-ink">
          {isFavorites ? "В избранном пусто" : "Здесь пока пусто"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {isFavorites
            ? "Отмечайте лучшие кадры сердечком — они появятся здесь."
            : "Создайте первый кадр или видео в Студии."}
        </p>
      </div>
      <Link
        href="/create"
        className="inline-flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#e11d48,#9f1239)] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        В Студию
        <ArrowRightIcon className="size-4" />
      </Link>
    </div>
  );
}
