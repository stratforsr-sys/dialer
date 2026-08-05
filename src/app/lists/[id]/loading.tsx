import { Bar, TableSkeleton } from "@/components/skeletons/Skeleton";

/** Mappens innehåll: rubrik med Starta dialer-knapp, sedan lead-raderna. */
export default function ListDetailLoading() {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="px-8 pt-6 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <Bar w={110} h={11} className="mb-4" />
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-2.5">
            <Bar w={240} h={20} />
            <Bar w={300} h={12} />
          </div>
          <div className="flex items-center gap-2">
            <Bar w={120} h={36} radius={10} />
            <Bar w={130} h={36} radius={10} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <Bar w={280} h={34} radius={10} />
          <Bar w={64} h={30} radius={9} />
          <Bar w={78} h={30} radius={9} />
          <Bar w={64} h={30} radius={9} />
        </div>
      </div>
      <TableSkeleton rows={12} />
    </div>
  );
}
