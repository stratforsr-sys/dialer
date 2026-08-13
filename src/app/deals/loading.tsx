import { Bar } from "@/components/skeletons/Skeleton";

/** Speglar tabellen i DealsView så raderna inte hoppar när de landar. */
export default function DealsLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <div
        className="flex items-center gap-4 px-6 h-[52px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <Bar w={52} h={15} />
        <Bar w={72} h={18} radius={9} />
        <Bar w={110} h={12} />
        <div className="flex-1" />
        <Bar w={260} h={32} radius={10} />
      </div>

      <div className="flex flex-col">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-[13px]"
            style={{
              borderBottom: "1px solid var(--border-subtle)",
              opacity: Math.max(0.25, 1 - i * 0.09),
            }}
          >
            <div className="flex flex-col gap-1.5 flex-1">
              <Bar w="34%" h={13} />
              <Bar w="18%" h={10} />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Bar w="52%" h={13} />
              <Bar w="68%" h={10} />
            </div>
            <Bar w={84} h={13} />
            <Bar w={72} h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
