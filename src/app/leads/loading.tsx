import { Bar, TableSkeleton } from "@/components/skeletons/Skeleton";

export default function LeadsLoading() {
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-6 h-[56px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <Bar w={54} h={15} />
          <Bar w={34} h={18} radius={9} />
        </div>
        <div className="flex items-center gap-2">
          <Bar w={220} h={32} radius={8} />
          <Bar w={104} h={32} radius={8} />
        </div>
      </div>
      <TableSkeleton rows={12} />
    </div>
  );
}
