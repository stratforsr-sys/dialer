import { Bar } from "@/components/skeletons/Skeleton";

export default function StatsLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>
      <div
        className="flex items-center justify-between px-6 h-[56px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <Bar w={92} h={15} />
        <Bar w={180} h={32} radius={8} />
      </div>

      <div className="p-6 flex flex-col gap-4">
        {/* Nyckeltalen */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[16px] p-5 flex flex-col gap-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <Bar w={104} h={11} />
              <Bar w={84} h={28} />
              <Bar w={64} h={10} />
            </div>
          ))}
        </div>

        {/* Diagramytan */}
        <div
          className="rounded-[16px] p-5 flex flex-col gap-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <Bar w={150} h={13} />
          <div className="flex items-end gap-2 h-[180px]">
            {Array.from({ length: 14 }).map((_, i) => (
              <Bar key={i} w="100%" h={40 + ((i * 37) % 130)} radius={5} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
