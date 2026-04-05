export default function StatsLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="h-6 w-32 rounded-[6px] skeleton" />
        <div className="ml-auto flex gap-2">
          {[70, 70, 70].map((w, i) => (
            <div key={i} className="h-8 rounded-[8px] skeleton" style={{ width: w }} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[14px] p-5 border space-y-3"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="h-3 w-20 rounded-[4px] skeleton" />
              <div className="h-8 w-16 rounded-[6px] skeleton" />
              <div className="h-2.5 w-24 rounded-[4px] skeleton" />
            </div>
          ))}
        </div>

        {/* Chart row */}
        <div className="grid grid-cols-3 gap-4">
          <div
            className="col-span-2 rounded-[14px] p-5 border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="h-4 w-32 rounded-[5px] skeleton mb-4" />
            <div className="h-48 w-full rounded-[10px] skeleton" />
          </div>
          <div
            className="rounded-[14px] p-5 border space-y-3"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="h-4 w-24 rounded-[5px] skeleton" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 rounded-[4px] skeleton" style={{ width: 80 + i * 10 }} />
                <div className="h-2 flex-1 rounded-full skeleton" />
                <div className="h-3 w-8 rounded-[4px] skeleton" />
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div
          className="rounded-[14px] border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-4 px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            {[100, 80, 80, 80, 80].map((w, i) => (
              <div key={i} className="h-3 rounded-[4px] skeleton" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-b last:border-0" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 120 }} />
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 50 }} />
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 50 }} />
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 50 }} />
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 50 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
