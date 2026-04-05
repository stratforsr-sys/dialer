export default function LeadsLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Toolbar skeleton */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="h-8 w-56 rounded-[8px] skeleton" />
        <div className="h-8 w-32 rounded-[8px] skeleton" />
        <div className="ml-auto h-8 w-24 rounded-[8px] skeleton" />
      </div>

      {/* Table header */}
      <div
        className="flex items-center gap-4 px-5 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {[120, 160, 100, 80, 90, 70].map((w, i) => (
          <div key={i} className="h-3 rounded-[4px] skeleton shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3 border-b"
            style={{
              borderColor: "var(--border-subtle)",
              opacity: 1 - i * 0.04,
            }}
          >
            <div className="h-3 rounded-[4px] skeleton" style={{ width: 130 + (i % 3) * 20 }} />
            <div className="h-3 rounded-[4px] skeleton" style={{ width: 90 + (i % 4) * 15 }} />
            <div className="h-3 rounded-[4px] skeleton" style={{ width: 70 }} />
            <div className="h-5 w-20 rounded-[6px] skeleton" />
            <div className="ml-auto h-3 rounded-[4px] skeleton" style={{ width: 60 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
