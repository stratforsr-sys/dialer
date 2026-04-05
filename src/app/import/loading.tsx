export default function ImportLoading() {
  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-2xl space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-[6px] skeleton" />
          <div className="h-3 w-64 rounded-[4px] skeleton" />
        </div>

        {/* Drop zone */}
        <div
          className="rounded-[18px] border-2 border-dashed h-48 flex items-center justify-center"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-[12px] skeleton" />
            <div className="h-3 w-40 rounded-[4px] skeleton" />
            <div className="h-3 w-28 rounded-[4px] skeleton" />
          </div>
        </div>

        {/* Column mapping skeleton */}
        <div
          className="rounded-[14px] border p-5 space-y-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="h-4 w-36 rounded-[5px] skeleton" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 100 + i * 15 }} />
              <div className="h-1 flex-1 border-b border-dashed" style={{ borderColor: "var(--border)" }} />
              <div className="h-8 w-36 rounded-[8px] skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
