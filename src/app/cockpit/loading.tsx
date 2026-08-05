import { Bar } from "@/components/skeletons/Skeleton";

/**
 * Dialern öppnas mitt i ett arbetsflöde — säljaren har precis tryckt "Starta
 * dialer" och väntar på första bolaget. Skelettet håller ramen still så att
 * kortet inte hoppar in när kön landar.
 */
export default function CockpitLoading() {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Topprad */}
      <div
        className="flex items-center justify-between px-5 h-[52px] shrink-0"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <Bar w={72} h={13} />
          <Bar w={140} h={13} />
        </div>
        <div className="flex items-center gap-3">
          <Bar w={160} h={3} radius={2} />
          <Bar w={54} h={12} />
        </div>
      </div>

      {/* Leadkortet */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-[560px] flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3 w-full">
            <Bar w={64} h={64} radius={20} />
            <Bar w="55%" h={24} />
            <Bar w="35%" h={13} />
          </div>

          <div className="flex flex-col items-center gap-2.5 w-full">
            <Bar w="42%" h={30} radius={10} />
            <Bar w="28%" h={12} />
          </div>

          {/* Statusknapparna 1–5 */}
          <div className="flex items-center justify-center gap-2 w-full mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bar key={i} w={96} h={40} radius={12} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
