export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Skyddar allt utom:
     * - /login
     * - /api/auth/*        (NextAuth egna endpoints)
     * - /_next/*           (Next.js internals)
     * - /favicon.ico, statiska filer
     * - /icon.png, /apple-icon.png — flikikonen hämtas även av utloggade
     *   användare på inloggningssidan. Utan undantaget svarar middleware med
     *   en redirect och ikonen visas aldrig.
     *
     * Maskin-till-maskin-endpoints måste också undantas. De har ingen
     * sessionskaka, så middleware svarade tidigare med 307 till /login:
     * - /api/cron/*          Vercel Cron, autentiseras med CRON_SECRET-bearer.
     *                        Jobbet nådde aldrig sin handler.
     * - /api/meeting-outcome Klick i mötesmejl, autentiseras med signerat
     *                        per-möte-token. Länkarna nådde aldrig sin handler.
     * - /api/telephony/*     Inkommande webhooks från växeln, autentiseras med
     *                        HMAC-signatur. Undantaget finns på plats i förväg
     *                        eftersom en provider som får 307 gör om anropet i
     *                        all evighet.
     *
     * Varje undantagen route MÅSTE göra sin egen autentisering i handlern.
     */
    "/((?!login|api/auth|api/cron|api/meeting-outcome|api/telephony|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};
