import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon } from "./icons";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  list?: string[];
};

export function LegalDoc({
  badge,
  title,
  intro,
  updated,
  sections,
  outro,
  related,
}: {
  badge: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
  outro?: string;
  related?: { href: string; label: string }[];
}) {
  return (
    <main className="flex-1 py-14 sm:py-20">
      <div className="container-page max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-medium text-muted">
          <ShieldCheckIcon className="size-4 text-brand" />
          {badge}
        </span>

        <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          {intro}
        </p>
        <p className="mt-4 text-xs uppercase tracking-wider text-faint">
          Редакция от {updated}
        </p>

        <div className="mt-10 flex flex-col gap-4">
          {sections.map((section, i) => (
            <section
              key={section.title}
              className="rounded-card border border-line bg-panel p-6 sm:p-7"
            >
              <h2 className="flex gap-3 font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
                <span className="text-brand">{i + 1}.</span>
                <span>{section.title}</span>
              </h2>

              {section.paragraphs?.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-3 text-sm leading-relaxed text-muted"
                >
                  {paragraph}
                </p>
              ))}

              {section.list && (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {section.list.map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 text-sm leading-relaxed text-muted"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {outro && (
          <p className="mt-6 rounded-panel border border-line-strong bg-panel-hover px-6 py-5 text-sm leading-relaxed text-ink sm:px-7">
            {outro}
          </p>
        )}

        {related && related.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-3">
            {related.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-5 text-sm font-semibold text-ink transition-colors hover:bg-panel-hover"
              >
                {link.label}
                <ArrowRightIcon className="size-4" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
