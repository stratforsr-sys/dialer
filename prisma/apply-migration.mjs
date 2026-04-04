import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync(join(__dirname, "migrations/init.sql"), "utf-8");

// Remove comment lines then split on semicolons
const cleaned = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const statements = cleaned
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${statements.length} statements to Turso...`);

for (const stmt of statements) {
  try {
    await client.execute(stmt + ";");
    const preview = stmt.slice(0, 70).replace(/\s+/g, " ");
    console.log("✓", preview);
  } catch (err) {
    if (err.message.includes("already exists") || err.message.includes("duplicate")) {
      const preview = stmt.slice(0, 70).replace(/\s+/g, " ");
      console.log("⚠ skip (already exists):", preview);
    } else {
      const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
      console.error("✗ FAILED:", preview);
      console.error("  Error:", err.message);
      process.exit(1);
    }
  }
}

console.log("\n✅ Migration applied successfully!");
client.close();
