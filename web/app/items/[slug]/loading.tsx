export default function ItemLoading() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8 sm:py-16 animate-pulse">
      <div className="mb-8">
        <div className="h-4 w-24 rounded bg-claude-surface-soft mb-6" />
        <div className="h-3 w-32 rounded bg-claude-surface-soft mb-4" />
        <div className="h-10 w-3/4 rounded bg-claude-surface-soft mb-3" />
        <div className="h-10 w-1/2 rounded bg-claude-surface-soft mb-6" />
        <div className="flex gap-3">
          <div className="h-5 w-16 rounded-full bg-claude-surface-soft" />
          <div className="h-5 w-20 rounded-full bg-claude-surface-soft" />
          <div className="h-5 w-24 rounded-full bg-claude-surface-soft" />
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">
        <div className="space-y-8">
          {/* TLDR */}
          <div className="rounded-xl bg-claude-surface-soft p-5">
            <div className="h-4 w-12 rounded bg-claude-hairline mb-3" />
            <div className="h-4 w-full rounded bg-claude-hairline mb-2" />
            <div className="h-4 w-5/6 rounded bg-claude-hairline" />
          </div>

          {/* Body sections */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-5 w-40 rounded bg-claude-surface-soft mb-4" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-claude-surface-soft" />
                <div className="h-4 w-full rounded bg-claude-surface-soft" />
                <div className="h-4 w-4/5 rounded bg-claude-surface-soft" />
              </div>
            </div>
          ))}
        </div>

        <div className="hidden lg:block space-y-4 mt-0">
          <div className="rounded-xl border border-claude-hairline p-5">
            <div className="h-4 w-16 rounded bg-claude-surface-soft mb-3" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 w-16 rounded-full bg-claude-surface-soft" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-claude-hairline p-5">
            <div className="h-4 w-20 rounded bg-claude-surface-soft mb-3" />
            <div className="h-8 w-full rounded bg-claude-surface-soft" />
          </div>
        </div>
      </div>
    </div>
  );
}
