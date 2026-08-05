import { Bar, HeaderSkeleton } from "@/components/skeletons/Skeleton";

/** Speglar kortrutnätet i ListsBoard så innehållet inte hoppar när det landar. */
export default function ListsLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <HeaderSkeleton />
      <div
        className="p-6 grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[18px] overflow-hidden"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              opacity: Math.max(0.3, 1 - i * 0.13),
            }}
          >
            <div className="p-5 pb-4">
              <div className="flex items-start gap-3">
                <Bar w={36} h={36} radius={11} />
                <div className="flex flex-col gap-2 flex-1">
                  <Bar w="70%" h={14} />
                  <Bar w="45%" h={10} />
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex justify-between">
                  <Bar w={130} h={10} />
                  <Bar w={72} h={16} radius={8} />
                </div>
                <Bar w="100%" h={5} radius={3} />
              </div>
            </div>
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--surface-inset)",
              }}
            >
              <Bar w={70} h={22} radius={11} />
              <Bar w={120} h={30} radius={9} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
