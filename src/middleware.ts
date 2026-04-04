export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protect all routes except:
     * - /login
     * - /api/auth/* (NextAuth endpoints)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, static files
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
