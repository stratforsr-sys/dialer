/**
 * Seed script — run with: node prisma/seed.mjs
 *
 * Creates:
 *   - 1 admin user (change email/password below before running)
 *
 * Pipeline-stegen seedades här fram till migration 015. De togs bort med
 * tabellen: verksamheten är one call close och en affär har inga stadier.
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import { randomBytes } from "crypto";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

// ── Change these before running ─────────────────────────────────────────────
const ADMIN_EMAIL = "admin@clicknet.se";
const ADMIN_NAME = "Admin";
const ADMIN_PASSWORD = "Familjen123";
// ────────────────────────────────────────────────────────────────────────────

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function cuid() {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(16).toString("base64url").slice(0, 20);
  return "c" + timestamp + random;
}

console.log("🌱 Seeding database...\n");

const adminId = cuid();
const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
const now = new Date().toISOString();

try {
  await client.execute({
    sql: `INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'ADMIN', ?, ?)`,
    args: [adminId, ADMIN_EMAIL, passwordHash, ADMIN_NAME, now, now],
  });
  console.log(`\n  ✓ Admin user: ${ADMIN_EMAIL}`);
} catch (err) {
  if (err.message.includes("UNIQUE constraint failed")) {
    console.log(`\n  ⚠ Admin user already exists: ${ADMIN_EMAIL}`);
  } else {
    throw err;
  }
}

console.log("\n✅ Seed complete!");
console.log(`\n   Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}\n`);

client.close();
