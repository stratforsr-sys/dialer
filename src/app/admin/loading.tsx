export default function AdminLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="h-6 w-28 rounded-[6px] skeleton" />
        <div className="ml-auto h-8 w-28 rounded-[8px] skeleton" />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Users section */}
        <div
          className="rounded-[14px] border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="h-4 w-20 rounded-[5px] skeleton" />
            <div className="h-7 w-24 rounded-[8px] skeleton" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-4 border-b last:border-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="h-8 w-8 rounded-[10px] skeleton shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 rounded-[4px] skeleton" style={{ width: 120 + i * 10 }} />
                <div className="h-2.5 rounded-[4px] skeleton" style={{ width: 160 }} />
              </div>
              <div className="h-6 w-16 rounded-[20px] skeleton" />
              <div className="h-7 w-7 rounded-[8px] skeleton" />
            </div>
          ))}
        </div>

        {/* Pipeline stages section */}
        <div
          className="rounded-[14px] border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="h-4 w-32 rounded-[5px] skeleton" />
            <div className="h-7 w-24 rounded-[8px] skeleton" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-3.5 border-b last:border-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="h-4 w-4 rounded-full skeleton shrink-0" />
              <div className="h-3 rounded-[4px] skeleton" style={{ width: 90 + i * 12 }} />
              <div className="ml-auto flex gap-2">
                <div className="h-6 w-6 rounded-[6px] skeleton" />
                <div className="h-6 w-6 rounded-[6px] skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
