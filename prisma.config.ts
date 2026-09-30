// `.env.local` uttryckligen — projektet har ingen `.env`, så `dotenv/config`
// hade laddat ingenting och lämnat DIRECT_URL odefinierad. Det är samma skäl
// som gör att migrationerna körs med en egen runner och inte Prisma Migrate.
import { config } from "dotenv";
config({ path: new URL("./.env.local", import.meta.url).pathname });
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // `db push` och migrationsmotorn vill ha URL:en här, inte bara en adapter.
  // DIRECT_URL och inte DATABASE_URL: schemaoperationer går inte genom
  // poolern.
  datasource: {
    url: process.env.DIRECT_URL!,
  },
  // @ts-expect-error adapter är en giltig runtime-egenskap men ännu inte typad
  adapter: () => new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});
