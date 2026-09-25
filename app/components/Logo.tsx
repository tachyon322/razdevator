import Link from "next/link";
import { CameraIcon } from "./icons";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5"
      aria-label="Раздеватор — на главную"
    >
      <span className="relative grid size-9 place-items-center rounded-tile bg-[linear-gradient(135deg,#e11d48,#9f1239)] shadow-[0_8px_28px_-10px_rgba(225,29,72,0.75)]">
        <CameraIcon className="size-5 text-white" />
      </span>
      {!compact && (
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[17px] font-bold tracking-tight text-ink">
            Раздеватор
          </span>
          <span className="rounded-full border border-line-strong px-1.5 py-px text-[10px] font-semibold leading-4 text-muted">
            18+
          </span>
        </span>
      )}
    </Link>
  );
}
