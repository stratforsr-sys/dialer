/**
 * Skelettbyggstenar för loading.tsx-filerna.
 *
 * Utan en loading.tsx renderar Next.js ingenting alls medan en dynamisk sida
 * hämtas — webbläsaren står kvar på den gamla vyn och ser frusen ut. Med ett
 * skelett byts vyn direkt vid klicket och innehållet strömmas in när det är
 * klart. Servertiden är densamma; upplevelsen är en helt annan.
 *
 * Formerna speglar den riktiga layouten så att innehållet inte hoppar när det
 * landar. Ingen spinner — projektets designregler säger skelett, inte snurra.
 */

export function Bar({
  w = "100%",
  h = 12,
  radius = 6,
  className = "",
}: {
  w?: string | number;
  h?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <div
      className={`shimmer ${className}`}
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: `${h}px`,
        borderRadius: `${radius}px`,
      }}
    />
  );
}

/** Rubrikblocket som de flesta sidor inleds med. */
export function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="px-8 pt-8 pb-6" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex flex-col gap-2.5">
          <Bar w={190} h={20} />
          <Bar w={260} h={12} />
        </div>
        {action && <Bar w={150} h={36} radius={10} />}
      </div>
      <div className="flex items-center gap-3">
        <Bar w={280} h={34} radius={10} />
        <Bar w={70} h={30} radius={9} />
        <Bar w={90} h={30} radius={9} />
        <Bar w={80} h={30} radius={9} />
      </div>
    </div>
  );
}

/** Tabellrader — används av /leads och en mapps innehåll. */
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-6 py-3.5"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            // Raderna tonas ut nedåt så skelettet inte drar blicken från toppen
            opacity: Math.max(0.25, 1 - i * 0.075),
          }}
        >
          <Bar w={28} h={28} radius={8} />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <Bar w={`${38 + ((i * 13) % 26)}%`} h={12} />
            <Bar w={92} h={9} />
          </div>
          <Bar w={130} h={11} className="hidden md:block" />
          <Bar w={72} h={11} className="hidden lg:block" />
          <Bar w={58} h={18} radius={9} />
        </div>
      ))}
    </div>
  );
}
