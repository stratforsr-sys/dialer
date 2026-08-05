// Kör en godtycklig migrationsfil mot Turso:
//   node prisma/apply-sql.mjs 003_call_lists.sql
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const file = process.argv[2];
if (!file) {
  console.error("Användning: node prisma/apply-sql.mjs <fil i prisma/migrations>");
  process.exit(1);
}

if (!process.env.TURSO_DATABASE_URL) {
  console.error("TURSO_DATABASE_URL saknas — kolla .env.local");
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync(join(__dirname, "migrations", file), "utf-8");

const statements = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Kör ${statements.length} statements från ${file} mot Turso...\n`);

for (const stmt of statements) {
  const preview = stmt.slice(0, 72).replace(/\s+/g, " ");
  try {
    await client.execute(stmt + ";");
    console.log("✓", preview);
  } catch (err) {
    const msg = err.message.toLowerCase();
    if (msg.includes("already exists") || msg.includes("duplicate")) {
      console.log("⚠ hoppar över (finns redan):", preview);
    } else {
      console.error("✗ MISSLYCKADES:", preview);
      console.error("  Fel:", err.message);
      process.exit(1);
    }
  }
}

console.log("\n✅ Migrationen är applicerad.");
client.close();
