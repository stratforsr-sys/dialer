# Designsystem

Det här är ett operativt verktyg. En säljare gör 150 samtal om dagen i det och
tittar på samma skärm i sju timmar. Allt som konkurrerar om uppmärksamheten
kostar samtal. Måttstocken är inte "ser det häftigt ut i en skärmdump" utan
"går det att läsa av på en tiondels sekund, timme åtta".

**Källan är `src/app/globals.css`.** Doktrinen står överst i den filen och
tokens definieras där. Läs den innan du rör en färg, en radie eller en skugga.

## De tre reglerna

**1. Lager separeras med yta och linje, inte med skugga.**
`--bg` är mätbart mörkare än `--surface`, och en hairline gör resten. När ett
element inte syns tillräckligt: byt yta eller stärk kantlinjen. Höj det inte.

**2. Skugga är en relation, inte dekoration.** Fem nivåer, inga andra:

| Nivå | Token | Vad |
|------|-------|-----|
| 0 | `--shadow-0` | Kort, paneler, tabellrader, tabs, sekundärknappar |
| 1 | `--shadow-1` | Primärknapp, aktiv flik, hovrad rad |
| 2 | `--shadow-2` | Dropdown, popover, tooltip, hover-expanderad sidebar |
| 3 | `--shadow-3` | Modal, side sheet, inloggningskort |
| 4 | `--shadow-4` | Kanban-kort under drag, toast |

Skriv aldrig en `box-shadow` för hand. Tailwinds `shadow-sm/md/lg/xl` är
ompekade till samma skala i `tailwind.config.ts`, så de går inte att smita förbi.

**3. Accenten är en ficklampa.** `--accent` är Clicknet-grönt sänkt till
`#0B7F6E` (originalet `#3DD68C` ger 1,7:1 mot vitt och är oläsbart som knappyta).
Den får bära primär åtgärd, aktivt nav-läge och fokusring. Aldrig en yta,
aldrig dekoration. Ett fyllt grönt fält per skärmbild är taket.

## Radie

Fyra värden: `--r-sm` 6px, `--r-md` 10px, `--r-lg` 14px, `--r-full`.
Tailwinds `rounded-sm/md/lg/full` pekar på dem. Skriv aldrig `rounded-[13px]` —
det fanns tretton olika hårdkodade värden i koden en gång och de gick inte att
ändra centralt.

## Typografi

- **Inter** (`--font-sans`) — gränssnittet, tabellerna, allt under 16px.
- **Space Grotesk** (`--font-display`) — h1–h3 och stora mätvärden.
- **JetBrains Mono** (`--font-mono`) — telefonnummer, org.nr, tider, siffror
  som ska gå att jämföra i kolumn.

Ingen serif. Siffror i tabeller och mätare är alltid `tabular-nums`.

## Färgpar som måste hålla

Text på färgad yta använder sitt eget token, aldrig `white` eller `var(--bg)`:
`--on-accent` och `--on-danger`. De vänder med temat. Vit text på ljusröd yta
ger 2,6:1 i mörkt läge — det är därför tokenet finns.

## Vad som inte får komma tillbaka

- Glassmorphism på element som inte svävar. `backdrop-filter` hör hemma på
  lager som ligger *över* innehåll, ingen annanstans.
- Gradientknappar. `from-accent via-pink-500 to-violet` fanns här en gång.
- `translateY(-1px)` på hover. Ger jitter när pekaren passerar kanten —
  byt yta och kantlinje i stället.
- Skuggor i ren svart. Alla skuggor är kalltonade `rgba(16, 24, 40, …)` och
  lagrade i tre steg. Ett enda svart lager läser alltid som billigt.
- Nya inline-stilar där en komponentklass finns. `.card`, `.panel`, `.menu`,
  `.modal`, `.btn-*`, `.segmented`, `.stat-module` ligger i globals.css.

---

## Project: Sales Hub (Dialer → CRM)

> **Läs `docs/ARBETSLOGG.md` först.** Den bär beslut, fallgropar och öppna
> punkter från tidigare sessioner som inte går att läsa sig till ur koden —
> vad som väntar på omimport, vad som är blockerat av externa kvoter, och vilka
> val som redan är gjorda och varför. Uppdatera den när du avslutar ett arbete.

### Stack
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Turso (LibSQL/SQLite) — 9 GB free tier
- Prisma ORM + @prisma/adapter-libsql
- NextAuth.js — CredentialsProvider (email + password, bcrypt)
- @dnd-kit/core — Kanban drag-and-drop
- Framer Motion — animations
- xlsx — läser CSV och Excel vid import

### Architecture Rules
- Server Actions for ALL data mutations (no REST endpoints for CRUD)
- JWT session strategy (no session table in DB)
- Middleware protects all routes except /login
- Activity log is immutable — never delete Activity rows
- orgNumber uniqueness: on CSV import, if orgNumber exists → merge/update lead, never duplicate

### Database: Turso
- **En enda databas — den är också produktionens.** Det finns ingen separat
  dev-databas. Allt du kör mot den syns direkt på https://dialer-five.vercel.app/
- Prisma-schema i `prisma/schema.prisma`, genererad klient i `src/generated/prisma`
  (gitignorerad, byggs av `postinstall`)

#### Migrationer — INTE `prisma migrate dev`
Migrationerna är handskriven SQL, körd av en egen runner. `prisma migrate` används
aldrig: den vill äga en shadow-databas och rulla om schemat, vilket mot en delad
produktionsdatabas är fel verktyg.

1. Ändra `prisma/schema.prisma`
2. `npx prisma generate`
3. Skriv en ny numrerad fil i `prisma/migrations/`, t.ex. `009_nagot.sql`
4. `node prisma/apply-sql.mjs 009_nagot.sql --dry-run` för att se vad som körs
5. `node prisma/apply-sql.mjs 009_nagot.sql`

Runnern bokför varje fil med checksumma i tabellen `_migrations`. Den vägrar köra
om en redan applicerad fil, och vägrar köra en fil som ändrats sedan den kördes.
**Ändra därför aldrig en applicerad migrationsfil — skriv en ny.** Hela filen körs
med `executeMultiple()`, så SQLite tolkar satsgränserna själv; SQLite rullar inte
tillbaka DDL, så en fil som fallerar mitt i lämnar databasen halvmigrerad.

`prisma/apply-migration.mjs` är den gamla runnern (splittar på `;`, sväljer
"already exists" tyst). Använd den inte.

Eftersom pushen går rakt till produktion måste migrationen köras i samma arbetspass
som koden pushas — annars kraschar sajten på kolumner som inte finns.

### Git & deploy
- Commita och pusha **direkt till `main`**. Inga feature-branches, inga PR:er.
- `main` auto-deployar till https://dialer-five.vercel.app/ (Vercel-projekt `dialer`).
  En branch når aldrig sajten, så ändringen finns i praktiken inte förrän den är på `main`.

### User Roles
- ADMIN: sees all leads, all stats, manages users and pipeline stages
- SELLER: sees only own leads, own stats

### Pipeline Stages (seeded i prisma/seed.mjs, admin-configurable)
Stegen är bara seed-data — de säger inget om vilka funktioner som finns. "Möte
bokat" är kvar som steg trots att mötesbokningen togs bort i migration 007.
1. Fallback (default for new leads)
2. Möte bokat
3. Demo
4. Offert
5. Stängd vunnen (isWon)
6. Stängd förlorad (isLost)

### Key Features
- Kanban board (pipeline view) + Cockpit (power-dialing mode) — both exist
- Multiple contacts per lead (company = lead, person = contact)
- Multiple deals per lead (no pipeline for deals, just status: OPEN/WON/LOST)
- Activity log on every lead — visible to all users
- Fluff tracking: auto-measure idle time between calls
- Global search across leads, contacts, org numbers
- Manus per ramverkssteg, i prioritetsordnade varianter (`src/lib/script-resolver.ts`).
  Manustexten visas ordagrant — radbrytningar och blankrader är en del av manuset,
  så alla vyer som renderar den måste ha `whitespace-pre-wrap`
- Uppföljningsmotorn: `CallAttempt` är append-only och all statistik läses därifrån

### Cron (vercel.json)
- `/api/cron/enrich?tier=0` — dagligen 01:00
- `/api/cron/enrich?tier=1&limit=40` — 02:30 mån–fre

Det finns ingen mötesbokning och ingen utgående e-post. Möten togs bort i migration
007 (verksamheten är one call close); återkomster hanteras av `Lead.callbackAt` och
`CallAttempt.outcome = CALLBACK_BOOKED`. Gamla `MEETING_*`-rader ligger kvar i
aktivitetsloggen med flit — loggen är oföränderlig.
