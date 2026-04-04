/**
 * Seed script — run with: node prisma/seed.mjs
 *
 * Creates:
 *   - 6 pipeline stages (Fallback → Stängd förlorad)
 *   - 1 admin user (change email/password below before running)
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
const ADMIN_EMAIL = "admin@telink.se";
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

const stages = [
  { id: cuid(), name: "Fallback",        order: 0, color: "#6B7280", isDefault: true,  isWon: false, isLost: false },
  { id: cuid(), name: "Möte bokat",      order: 1, color: "#3B82F6", isDefault: false, isWon: false, isLost: false },
  { id: cuid(), name: "Demo",            order: 2, color: "#8B5CF6", isDefault: false, isWon: false, isLost: false },
  { id: cuid(), name: "Offert",          order: 3, color: "#F59E0B", isDefault: false, isWon: false, isLost: false },
  { id: cuid(), name: "Stängd vunnen",   order: 4, color: "#10B981", isDefault: false, isWon: true,  isLost: false },
  { id: cuid(), name: "Stängd förlorad", order: 5, color: "#EF4444", isDefault: false, isWon: false, isLost: true  },
];

console.log("🌱 Seeding database...\n");

for (const stage of stages) {
  await client.execute({
    sql: `INSERT OR IGNORE INTO PipelineStage (id, name, "order", color, isDefault, isWon, isLost, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      stage.id,
      stage.name,
      stage.order,
      stage.color,
      stage.isDefault ? 1 : 0,
      stage.isWon ? 1 : 0,
      stage.isLost ? 1 : 0,
    ],
  });
  console.log(`  ✓ Stage: ${stage.name}`);
}

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
