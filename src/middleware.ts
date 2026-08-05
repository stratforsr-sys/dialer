export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protect all routes except:
     * - /login
     * - /api/auth/* (NextAuth endpoints)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, static files
     * - /icon.png, /apple-icon.png — flikikonen hämtas även av utloggade
     *   användare på inloggningssidan. Utan undantaget svarar middleware med
     *   en redirect och ikonen visas aldrig.
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};
