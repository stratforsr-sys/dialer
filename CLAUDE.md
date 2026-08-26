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
| 4 | `--shadow-4` | Toast |

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

### Lead-listan är avvecklad
`/leads` redirectar till `/lists` och finns inte i menyn. Den var en andra,
parallell ingång till samma bolag som redan ligger i en ringlista. **`/leads/[id]`
lever vidare och är oförändrad** — det är dit notisklockan, sökträffarna,
affärerna och research länkar. Lägg inte tillbaka listvyn utan att först fråga.

### Anteckningar
Två spår som tidigare inte kände till varandra:
- **Cockpit-anteckningen** sparas på `CallAttempt.note`. Den renderades förut
  ingenstans alls — data som lagrades men aldrig lästes. `recordAttempt` skriver
  nu även en `Activity` av typ `CALL` med `{ status, notes }`, men **bara när det
  finns en anteckning**: en rad per samtal hade lagt 150 rader per säljare och dag
  i en logg vars enda syfte är att gå att läsa.
- **Lead-sidans anteckning** skriver en `Activity` av typ `NOTE`.

`LeadHistory` i cockpiten slår ihop båda i en tidslinje. Rader är hopfällda till
tid + utfall; anteckningen fälls ut vid klick. Historiken hämtas i
`leaseNextLeads` select — **glöm den inte när nya fält tillkommer.**

### Låsning av lead — utfallet avgör (migration 017)

`Lead.claimedAt` är låset. Så länge det är satt ser ingen annan säljare bolaget
i sitt däck (`CLAIM_TTL_DAYS` = 60 i `src/lib/claim.ts`). Fram till 2026-08-13
sattes det vid **varje** disposition, vilket band upp ett bolag i två månader åt
den som råkade ringa först — även när samtalet gick till en telefonsvarare. 590
leads låg låsta; bara 45 hade ett skäl.

Regeln är nu `claimsLead(outcome)` i `src/lib/scheduler.ts`: **lås bara när det
finns en relation att skydda.**

| Utfall | Låser? | Varför |
|--------|--------|--------|
| `CALLBACK_BOOKED` | **ja** | Löftet är personligt — en kollega som ringer bränner det |
| `SOLD` | **ja** | Kunden är någons kund |
| `DM_NO` | nej | Ett nej är ingen relation |
| `WRONG_DM` | nej | Erbjudandet nådde aldrig fram |
| växelutfallen | nej | Ingen kontakt med beslutsfattaren |
| svarar ej / upptaget / röstbrevlåda | nej | Inte ens en kontakt |

Den **senaste** dispositionen avgör: ett icke-låsande utfall nollställer ett lås
som satts tidigare, annars låser ett bokat samtal bolaget kvar i två månader
efter att samma säljare fått ett nej på det. `ownerId` sätts fortfarande vid
varje samtal — den är "senast bearbetad av" och ger säljaren bolaget i sina
egna vyer, men låser ingen ute.

Att ett bolag med öppen återkomst är osynligt för alla sköts inte av låset utan
av återkomstfiltret i `leaseNextLeads`. Håll isär de två: låset styr *vem* som
får bolaget, filtret styr *om* någon får det alls.

### User Roles
- ADMIN: sees all leads, all stats, manages users and products
- SELLER: sees only own leads, own stats

### Affärer — pipelinen är borta (migration 015)
Det finns **ingen pipeline och inga stadier**. `PipelineStage` är droppad,
`Deal.stageId`, `probability` och `expectedCloseAt` likaså. Verksamheten är one
call close: antingen såldes det i samtalet eller inte, och ett bräde med fem
kolumner hade innehåll i en av dem.

- **En affär skapas i dispositionen.** Trycker säljaren `3 Såld` öppnas
  `RegisterDealModal` direkt. Samtalet skrivs **först när affären är sparad** —
  avbryter man rutan skrivs ingenting, så ett feltryck på 3 inte blir ett sålt
  samtal i statistiken utan kund bakom.
- **Fem fält:** kontaktperson, e-post, telefon, ordervärde och anteckning.
  Kontaktperson och belopp är obligatoriska, resten frivilligt.
- **Ett belopp, inte två.** `Deal.value` + `valueType` (`ONE_TIME` | `MONTHLY`).
  Engångsbelopp och månadsbelopp summeras alltid var för sig i statistiken och
  slås aldrig ihop till en siffra.
- **`DealStatus` är WON | LOST.** Raden föds `WON`. `LOST` betyder ångrad i
  efterhand, inte "förlorad i pipelinen". `cancelDeal` raderar aldrig — den
  sätter LOST och släpper tillbaka leadet i rotationen.
- **Kontaktuppgifterna kopieras till affären**, de pekas inte ut med
  `contactId`. Vem som skrev på ska stå kvar även om kontakten byts på leadet.
- **`/deals`** listar alla affärer, **`/deals/[id]`** är kunden. Historiken där
  är samma `LeadHistory` som i cockpiten — samtalen ligger kvar på leadet.
- `/pipeline` redirectar till `/deals`. `ActivityType.DEAL_STAGE_CHANGE` står
  kvar i enumet men skrivs aldrig: loggen är oföränderlig och Prisma kastar på
  ett enumvärde den inte känner igen.

### Key Features
- Cockpit (power-dialing mode) är den enda arbetsytan för samtal
- Multiple contacts per lead (company = lead, person = contact)
- Multiple deals per lead (status WON/LOST, inga stadier)
- Activity log on every lead — visible to all users
- Fluff tracking: auto-measure idle time between calls
- Sökning efter enskilda leads ligger i sökfältet på **Ringlistor**, inte i en
  egen lead-vy. Söker på bolagsnamn, kontaktperson, ort, org.nr och telefon
  (siffernormaliserat, så "070-123 45 67" hittar "+46701234567"), begränsat till
  det användaren har tillgång till. `searchAssignedLeads` i `actions/leads.ts`.
- **Öppna i dialer** tar ett utpekat bolag rakt in i cockpiten:
  `/cockpit?leadId=…` → `leaseSpecificLead`. Den **struntar i däckets filter** —
  spärrat, aktiv affär, öppen återkomst, spärrlista och maxade försök släpps
  igenom med en varning över bolagsrubriken i stället för att stängas ute.
  Rotationens filter avgör vad som ska *serveras*, inte vad någon får slå upp.
  Enda spärren är en kollegas levande arbetslås: hen sitter sannolikt i
  samtalet. Ingångarna är sökträffen på Ringlistor, knappen på `/leads/[id]`
  och ⌘K inne i cockpiten (`LeadSwitcher` — byter bolag i klienten, aldrig med
  en navigering, som hade delat ringsessionen i två). Cockpitens `listId` är
  därför `string | null`; ett bolag utan ringlista körs mot hela det egna
  däcket.
- Manus per ramverkssteg, i prioritetsordnade varianter (`src/lib/script-resolver.ts`).
  Manustexten visas ordagrant — radbrytningar och blankrader är en del av manuset,
  så alla vyer som renderar den måste ha `whitespace-pre-wrap`
- **Manus kan knytas till en enskild ringlista** (`ScriptTemplate.listId`, migration
  019). `NULL` = gäller alla mappar. Ett mappmanus **ersätter** det allmänna för
  sitt steg när säljaren ringer i mappen; steg mappen inte skrivit faller tillbaka
  på det allmänna. Utan mapp — ett bolag öppnat med ⌘K eller `?leadId=` — gäller
  bara de allmänna. Valet sker i `getActiveScripts(listId)`, och `listId` måste
  vara samma mapp som cockpiten säger sig köra i. Raderas mappen nollas `listId`
  av FK:n, så `deleteList` inaktiverar mappens manus först — annars hade ett
  kampanjmanus blivit allmänt i samma sekund
- Uppföljningsmotorn: `CallAttempt` är append-only och all statistik läses därifrån

### Cron (vercel.json)
- `/api/cron/enrich?tier=0` — dagligen 01:00
- `/api/cron/enrich?tier=1&limit=40` — 02:30 mån–fre
- `/api/cron/industry?limit=300` — dagligen 03:00
- `/api/cron/callback-reminders` — 06:00 UTC mån–fre (08:00 svensk sommartid,
  07:00 vintertid). Cron körs alltid i UTC; tiden är vald så att mejlet aldrig
  landar före klockan sju lokalt.

### Återkomster och e-post
Det finns ingen mötesbokning — möten togs bort i migration 007, verksamheten är
one call close. Gamla `MEETING_*`-rader ligger kvar i aktivitetsloggen med flit;
loggen är oföränderlig.

Återkomster är däremot en egen tabell sedan migration 014: **`Callback`**.
`Lead.callbackAt` finns kvar och skrivs fortfarande — lease-frågan sorterar på
den — men den är ett denormaliserat eko av den öppna raden, inte sanningen.
Rör man den ena måste man röra den andra (`syncLeadFromCallbacks` i
`src/app/actions/callbacks.ts`).

- **Missad är inget lagrat status.** Det är `PENDING` med en tid som passerat.
  Den ligger kvar hur länge som helst — klockan har tak men inget golv.
- **Bokningen sker i `recordAttempt`**, i samma transaktion som samtalet.
- **`sellerId` är den som lovade**, inte `Lead.ownerId` — ägarskapet byter hand
  vid nästa disposition, påminnelsen ska ändå gå till rätt person.

#### Ett löfte tillhör den som gav det (migration 016)

En återkomst lämnar klockan på **två** sätt: säljaren som lovade ringde bolaget,
eller säljaren avbokade den. Tiden är inte ett tredje sätt. Bryts den regeln
försvinner löften tyst, och det är precis vad som hände fram till 2026-08-13 —
åtta av nio stängda återkomster stängdes av fel person, sju av dem före utsatt
tid. Två mekanismer håller regeln:

- **`recordAttempt` stänger bara den ringande säljarens egna, förfallna rader.**
  Bokas en ny stängs alla mina på bolaget oavsett tid (två löften på samma bolag
  är alltid fel). Ett terminalt utfall — sålt, fel nummer, ogiltigt nummer —
  stänger allas: det finns inget kvar att ringa om. En kollegas samtal rör
  aldrig mitt löfte.
- **Ett bolag med öppen återkomst ligger UTANFÖR däcket.** `leaseNextLeads`
  filtrerar bort det helt — inte "sist i kön", inte "bara till den som lovade".
  Ingen får det serverat av rotationen, inte löftesgivaren själv och inte en
  admin. Ett lovat samtal är inte ett slumpmässigt nästa lead: det ska ringas på
  tiden som utlovades, av personen som lovade, med anteckningen framför sig.
  Utan filtret sorterades leadet i stället överst i däcket hos hela golvet i
  sekunden klockan slog, och första kollega som dispositionerade det ringde
  kunden och stängde löftet.
- **Vägen till samtalet är notisklockan**, inte cockpiten. Raden bär nummer,
  anteckning och en dispositionsruta (`CallbackDisposition`). Bolaget kommer
  tillbaka in i rotationen på exakt två sätt, båda aktiva: någon
  dispositionerar samtalet — och då avgör utfallet vad som händer med leadet,
  precis som för alla andra samtal — eller någon avbokar återkomsten. En admin
  kan avboka vems rad som helst (`requireCallbackAccess`), vilket är utvägen när
  en säljare slutat. Ett bolag släpps av ett beslut, inte av en klocka; lägg
  inte tillbaka ett släpp på tid.
- **`answeredCallbackId` pekar ut raden dispositionen svarar på.** Klockan
  skickar med den, och då stängs just den raden oavsett klockslag. Utan den
  hade en säljare som ringde tio minuter för tidigt fått löftet kvar i klockan
  resten av veckan — tidsjämförelsen ensam kan inte skilja "jag ringde löftet"
  från "jag råkade ringa bolaget". Id:t verifieras mot lead och säljare i
  `recordAttempt`; ett id från klienten är ett önskemål, inte ett bevis.

`CallbackDisposition` använder **samma** `cockpit-flow`, `DispositionBar`,
`CallbackForm`, `FrameworkTap` och `RegisterDealModal` som cockpiten. Bygg inte
en kortare variant: två dispositionsflöden som skiljer sig i ett steg ger
statistik som inte går att jämföra och tangenter säljaren måste lära sig två
gånger. Till skillnad från cockpiten väntar rutan på serversvaret innan den
stängs — där är skriv-bakom-kön hela poängen, här är ett tyst bortfall på ett
lovat samtal precis det felet som skulle lagas.

Stänger dispositionen inte alla rader måste `Lead.callbackAt` och `nextActionAt`
skrivas om från den tidigaste som är kvar — de är ett eko av den öppna raden, och
ett `null` där hade lämnat löftet i klockan men bolaget utanför däcket.

**`nextActionAt = NULL` betyder "aldrig ringt", inte "ringbart nu".** De är
ringbara på samma sätt, men bara den ena sorterar överst: `ORDER BY nextActionAt
ASC` lägger NULL först i SQLite. Skriv därför aldrig NULL på ett lead som ringts
— använd `rotationResumeAt` i `scheduler.ts`, som räknar fram tiden ur
`lastAttemptAt` + vilotiden för `lastResult`. Det var precis det
`syncLeadFromCallbacks` gjorde fel fram till 2026-08-26: en avbokad återkomst la
bolaget överst i däcket i stället för tillbaka i kön, och 74 leads låg så.
Avbokning släpper också `claimedAt` — låset skyddar ett löfte, och finns löftet
inte kvar finns ingen relation att skydda.

### Mappvyn måste säga samma sak som däcket

`src/lib/deck-state.ts` speglar WHERE-satsen i `leaseNextLeads` som ren logik,
så att `/lists/[id]` kan visa **varför** ett bolag inte delas ut (spärrat, kund,
spärrlista, lovad återkomst, taket nått, vilar). De två implementationerna är
avsiktligt separata — däcket måste filtrera i databasen, mappen måste förklara
för en människa — men de får aldrig säga olika saker. **Ändras det ena villkoret
ska det andra ändras i samma commit.**

Utan den var mappen en väg runt alla regler: 831 av 5 668 bolag i Clicknet
Lista 1 såg ringbara ut men var det inte, och `leaseSpecificLead` (som med flit
struntar i däckets filter) öppnade dem villigt därifrån.

### Cockpitens skrivningar går genom kön — alla

`useDispositionQueue` → `/api/dispositions` ger omförsök vid nätverksfel,
`keepalive` när fliken stängs och en synlig remsa när det ändå inte gick.
**"Inget telefonnummer" ligger i samma kö** (`kind: "noPhoneFound"`) trots att
den inte skriver någon `CallAttempt`. Fram till 2026-08-26 var den ett
direktanrop med `.catch(() => {})` — systemets enda oåterkalleliga åtgärd var
alltså också dess enda oskyddade. Lägg aldrig tillbaka en skrivning från
cockpiten utanför kön.

Utgående e-post finns, men gör exakt en sak: morgonmejlet med dagens
återkomster. Det skickas **bara** för rader där säljaren kryssat i
`emailReminder` — det är hela poängen med krysset, och förvalet är urbockat.
Ingen bekräftelse skickas vid bokning. Vill man lägga till fler mejltyper:
`src/lib/email/send.ts` (Resend via `fetch`, kastar aldrig, är avstängd utan
`RESEND_API_KEY` + `EMAIL_FROM`).

**Räkna aldrig dygn i UTC.** Vercel kör i UTC och en återkomst bokad 22:30
svensk tid ligger på nästa datum där. `src/lib/time.ts` har `startOfDay`,
`endOfDay` och `isSameDay` för Europe/Stockholm — använd dem, även i klienten.
