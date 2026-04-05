export default function ResearchLoading() {
  return (
    <div className="h-full flex" style={{ background: "var(--bg)" }}>
      {/* Sidebar */}
      <div
        className="w-80 shrink-0 flex flex-col border-r"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="px-5 pt-6 pb-4 border-b space-y-2" style={{ borderColor: "var(--border)" }}>
          <div className="h-5 w-36 rounded-[6px] skeleton" />
          <div className="h-3 w-48 rounded-[4px] skeleton" />
        </div>
        <div className="p-5 space-y-4">
          <div className="h-10 w-full rounded-[10px] skeleton" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-9 rounded-[10px] skeleton" />
            <div className="col-span-2 h-9 rounded-[10px] skeleton" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-9 rounded-[10px] skeleton" />
            <div className="h-9 rounded-[10px] skeleton" />
          </div>
          <div className="h-10 w-full rounded-[10px] skeleton" />
          <div className="space-y-2 pt-4">
            <div className="h-3 w-28 rounded-[4px] skeleton" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="h-4 w-4 rounded-[4px] skeleton shrink-0" />
                <div className="h-3 rounded-[4px] skeleton flex-1" style={{ maxWidth: 140 + i * 10 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="h-16 w-16 rounded-[20px] skeleton" />
      </div>
    </div>
  );
}
