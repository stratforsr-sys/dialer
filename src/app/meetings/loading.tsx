import { Bar } from "@/components/skeletons/Skeleton";

/** Speglar sidhuvudet och talen i MeetingsView så att inget hoppar när sidan landar. */
export default function MeetingsLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <div
        className="flex items-center gap-4 px-6 h-[52px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <Bar w={56} h={15} />
        <Bar w={180} h={12} />
      </div>
      <div className="max-w-[980px] w-full mx-auto px-6 py-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-module flex flex-col gap-2">
              <Bar w={80} h={10} />
              <Bar w={48} h={24} />
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4" style={{ opacity: Math.max(0.25, 1 - i * 0.15) }}>
            <Bar w={64} h={14} />
            <div className="flex flex-col gap-1.5 flex-1">
              <Bar w="40%" h={13} />
              <Bar w="25%" h={10} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
