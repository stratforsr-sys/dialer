export default function CockpitLoading() {
  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-6 px-4"
      style={{ background: "var(--bg)" }}
    >
      {/* Progress bar */}
      <div className="w-full max-w-xl">
        <div className="flex justify-between mb-2">
          <div className="h-3 w-24 rounded-[4px] skeleton" />
          <div className="h-3 w-16 rounded-[4px] skeleton" />
        </div>
        <div className="h-1.5 w-full rounded-full skeleton" />
      </div>

      {/* Main card */}
      <div
        className="w-full max-w-xl rounded-[18px] p-6 border space-y-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Company + stage badge */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 rounded-[6px] skeleton" />
            <div className="h-3 w-28 rounded-[4px] skeleton" />
          </div>
          <div className="h-6 w-20 rounded-[20px] skeleton" />
        </div>

        {/* Contact info */}
        <div className="rounded-[12px] p-4 space-y-3 border" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-inset)" }}>
          <div className="flex items-center justify-between">
            <div className="h-4 w-36 rounded-[5px] skeleton" />
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-[8px] skeleton" />
              <div className="h-7 w-7 rounded-[8px] skeleton" />
            </div>
          </div>
          <div className="h-3 w-24 rounded-[4px] skeleton" />
          <div className="h-3 w-40 rounded-[4px] skeleton" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b pb-3" style={{ borderColor: "var(--border)" }}>
          {[60, 80, 70].map((w, i) => (
            <div key={i} className="h-7 rounded-[7px] skeleton" style={{ width: w }} />
          ))}
        </div>

        {/* Notes area */}
        <div className="h-20 w-full rounded-[10px] skeleton" />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap justify-center w-full max-w-xl">
        {[100, 90, 110, 85, 95].map((w, i) => (
          <div key={i} className="h-9 rounded-[10px] skeleton" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}
