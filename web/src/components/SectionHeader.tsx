/** Numbered editorial section header: mono kicker, hairline rule, display title. */
export default function SectionHeader({
  index,
  kicker,
  title,
}: {
  index: string;
  kicker: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="kicker">
          {index} · {kicker}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-ink-600 to-transparent" />
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-mist-100 sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
