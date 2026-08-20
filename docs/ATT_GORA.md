# Att göra

Samlad lägesbild 2026-08-20. `ARBETSLOGG.md` är fortfarande källan till *varför*
— den här filen svarar på *vad som är kvar*, och varje punkt är avstämd mot
koden och mot produktionsdatabasen samma dag. Siffrorna är mätta, inte citerade
ur äldre anteckningar.

Ordningen är prioritet, inte ålder.

---

## P0 — trasigt i drift

### 1. `EMAIL_FROM` saknas i Vercel — morgonmejlet har aldrig skickats

`vercel env ls production` har `RESEND_API_KEY` (satt för 137 dagar sedan) men
**inget `EMAIL_FROM`**. `isEmailEnabled()` i `src/lib/email/send.ts` kräver
båda, så cron-jobbet svarar `skipped` varje morgon.

Mätt i produktionen: **6 återkomster har `emailReminder = 1`, 0 har
`emailSentAt`.** Sex säljare har kryssat i rutan och aldrig fått något. Det är
den enda utgående e-posten som finns, och den är tyst.

Åtgärd: verifiera domänen i Resend (SPF + DKIM — utan verifierad domän svarar
API:et 403 på `@clicknet.se`), sedan `vercel env add EMAIL_FROM production`.
Skriv värdet med `printf`, aldrig omdirigering från fil: `vercel env add` tar
med radbrytningen och hemligheten blir ett tecken för lång.

### 2. `/research` i menyn leder till 404

`NAV` i `src/components/AppSidebar.tsx:27` länkar till `/research`. Det finns
ingen `src/app/research/`. Varje säljare som klickar får en 404 i ett verktyg de
sitter i sju timmar om dagen.

Beslutet är produktens: bygg vyn eller ta bort raden. Att låta den ligga kvar är
det enda alternativ som är fel. Anrikningsdatan finns (`LeadClaim`: 56 067 rader,
`seo.rank` på 5 711 leads) — det finns alltså något att visa den dagen vyn byggs.

### 3. 51 förfallna återkomster ligger osedda

Nollmätning tagen 2026-08-20 kl 18, strax innan cockpit-klockan gick i drift.
**Det här är siffrorna att jämföra mot.**

| Säljare | Öppna | Förfallna | Kommande 7 d | Äldsta |
|---|---|---|---|---|
| Fredrik Pernehed | 40 | 16 | 13 | 2026-08-19 |
| Josef | 28 | 13 | 12 | 2026-08-13 |
| Kristoffer | 10 | 9 | 1 | 2026-08-13 |
| Diar Makin | 13 | 8 | 3 | 2026-08-13 |
| Zen Alsabti | 6 | 3 | 1 | 2026-08-10 |
| Vlado | 33 | 2 | 20 | 2026-08-18 |

130 öppna totalt. Notera riktningen: förfallna gick från 38 till 51 på två
dagar. Högen växer, den krymper inte av sig själv.

En missad återkomst är `PENDING` med en tid som passerat och
ligger kvar hur länge som helst — med flit, klockan har tak men inget golv. Men
ingen vy räknar dem per säljare, så tio dagar gamla löften syns bara för den som
redan har dåligt samvete. **Statistiken mäter samtal, inte hållna löften.**

Enklaste ingreppet: en kolumn i coachingvyn. Den är byggd för precis den här
sortens fråga och admin tittar redan där.

**Delvis angripet 2026-08-20:** cockpit har nu en egen återkomstklocka, så en
förfallen återkomst syns med röd siffra utan att säljaren lämnar passet (se
`ARBETSLOGG.md` samma dag). Det tar bort ursäkten men inte mätningen — ingen vy
räknar fortfarande hållna löften per säljare, och admin kan inte se om de 51
krympte. **Mät om siffrorna ovan efter någon vecka i drift.** Går de inte ner
är problemet inte synlighet, och då är kolumnen i coachingvyn nästa steg.

---

## P1 — mätning som är påbörjad men inte utläst

### 4. Läs `LEAD_LEASE_LOST` om några dagar

Mätpunkten deployades 2026-08-20 och står på noll rader. Kör innan någon rör
`leaseBlockSize` (25) eller `leaseMinutes` (15):

```sql
SELECT date(timestamp) AS dag, count(*)
  FROM Activity WHERE type = 'LEAD_LEASE_LOST'
 GROUP BY dag ORDER BY dag DESC;
```

Noll rader = förnyelsen räcker, rör ingenting. Rader varje dag = blocket är för
stort, eller så hamstrar någon — och då är punkt 5 nästa steg.

### 4b. Läs om återkomstklockan i cockpit används

Deployad 2026-08-20. Ett samtal som kom ur klockan skickar `answeredCallbackId`
in i `recordAttempt` — det är exakt spåret som skiljer "ringde för att klockan
sa till" från "ringde för att bolaget kom upp i däcket". Men ingenting räknar
det: `completedOnAttemptId` sätts i båda fallen och kan inte skilja dem åt.

Vill man kunna svara på om klockan bär sin plats i toppfältet behöver spåret
sparas. Enklast: en `Activity`-rad, som `LEAD_LEASE_LOST`. Gör det innan någon
föreslår att ta bort klockan för att "ingen använder den".

### 5. Lunchhamstringen är fortfarande omätt och olöst

En säljare som går på lunch med fliken öppen håller kvar 25 bolag: förnyelsen
tickar vidare oavsett om någon ringer. Presence-heartbeaten vet redan om
säljaren är aktiv (`status: "DIALING"`, var 15:e sekund). Att låta `renewLeases`
kräva ett livstecken från de senaste minuterna är ingreppet — men gör det efter
punkt 4, inte före.

### 6. 192 av 580 växelsamtal saknar disposition (33 %)

Var 148 av 485 den 2026-08-15. Andelen står stilla runt en tredjedel, alltså
växer bortfallet i takt med samtalen. Det är inte längre ett kopplingsfel utan
verkligt bortfall: växeln såg samtalet, ingen sa vad det ledde till.

En tredjedel osagt gör all statistik som räknas ur `CallAttempt` systematiskt
skev. Värt att ta reda på *vilka* samtal som faller bort innan man bygger något
ovanpå siffrorna — 69 av dem matchar inget bolag alls, resten gjorde det.

### 7. Frågorna till Lynes ligger kvar obesvarade

Tre saker, en enda kontakt räcker:

- **Inspelningar.** 580 samtal, 0 `recordingUrl`. Finns ett REST-API för att
  lista och ladda ner? Hur autentiseras det, och vilket fält knyter en
  inspelning till ett samtal? Webhooken skickar ingen samtalsidentifierare —
  bara `startTime`, `userId` och nummer.
- **`startTime`: ringde det eller svarades det?** Avgör om `duration` är
  samtalstid eller total tid. `talkSec` är tom på alla 580 samtal och kan inte
  fyllas förrän det är besvarat; tills dess överskattas uppkopplad tid för
  säljare vars samtal ringer länge.
- **`callType`.** "Inbound" på ett utgående samtal är troligen benet in mot
  växeln, men det är en gissning. Använd inte fältet förrän någon vet.

**Besvarad sedan loggen skrevs:** Lynes skickar en sluthändelse.
`TelephonyCall.status` är COMPLETED 485 / NO_ANSWER 95 — ingenting står kvar på
`RINGING`. Farhågan att `duration` skulle vara permanent tom var obefogad.

---

## P2 — funktioner som saknas

### 8. Ingen överlämning när en säljare slutar — utom via papperskorgen

Reservationen bakom en öppen återkomst är permanent. Slutar någon går bolagen
tillbaka till golvet bara om en admin avbokar raderna **en och en** i klockans
golvvy. Josef och Kristoffer har 38 öppna tillsammans; med tjugo säljare är det
en funktion som saknas, inte ett kvartsjobb.

**Delvis löst 2026-08-20:** raderar man kontot flyttas alla öppna återkomster
till den admin som raderar, claim-låsen släpps och bolagen går tillbaka i
rotationen (se `ARBETSLOGG.md` samma dag). Men det kräver att man raderar
personen, och överlämning är inte samma sak som radering — en säljare som är
sjukskriven, byter distrikt eller går på föräldraledighet ska inte behöva
raderas för att någon annan ska kunna ringa hens löften.

Kvar att bygga: "flytta alla återkomster från A till B" som en egen knapp, med
valfri mottagare i stället för den som råkar klicka. `requireCallbackAccess`
släpper redan igenom admin på vems rad som helst — vägen finns, knappen saknas.
Flyttlogiken finns nu också, i `deleteUser`.

### 9. Återkomster längre bort än 7 dagar syns ingenstans

`HORIZON_DAYS = 7` i `src/app/actions/callbacks.ts:23`, och bolaget ligger
utanför däcket. **33 av 121 öppna återkomster ligger bortom horisonten just nu**
— osynliga tills de närmar sig. Inget är förlorat, men ingen kan svara på "vad
har jag lovat framåt". En veckovy löser både den här och punkt 8.

### 10. Ingen väg att registrera en affär i efterhand

`RegisterDealModal` öppnas bara ur dispositionen. Missar säljaren den finns
ingen knapp någonstans. `closedAt` är redan skild från `createdAt` just för att
bära ett efterhandsdatum den dagen ingången byggs.

Värt en kontrollfråga först: **1 944 dispositioner, 2 affärer i databasen.**
Antingen är konverteringen så låg, eller så registreras affärer någon
annanstans än i systemet. Svaret avgör om det här är en liten lucka eller ett
hål där hela intäktsstatistiken läcker ut.

### 11. `Callback` skriver ingen `Activity`-rad

Aktivitetsloggen på leadet nämner inte att en återkomst bokats eller avbokats.
Loggen är append-only så det är billigt — två skrivningar per disposition.
Historiken på bolaget är annars ofullständig på precis den händelse som oftast
förklarar varför ingen ringt på en vecka.

### 12. Reservationen syns inte i gränssnittet

Ett bolag låst till en kollegas löfte försvinner tyst ur däcket. Rätt beteende,
men en admin som undrar var ett lead tog vägen har ingen vy som svarar.
Chefsvyn (`scope: "floor"` i klockan) är det närmaste som finns.

### 13. Uppslagen i "Öppna i dialer" är oräknade

`leaseSpecificLead` släpper igenom spärrat, aktiv affär, öppen återkomst och
maxade försök med en varning. Ingen vet hur ofta det sker, alltså inte heller om
undantaget används som avsett eller blivit en genväg förbi notisklockan.

Samma mönster som `LEAD_LEASE_LOST` löste, och samma kod att kopiera: en rad i
aktivitetsloggen vid uppslag med varning.

### 14. Kollegans lås stänger ute även den som bara vill titta

Har en kollega bolaget uppe finns ingen väg in i cockpiten — inte ens för den
som fått kunden på tråden just nu. Övertagande med varning valdes bort för att
det kan rycka undan ett pågående samtal. Bygg det om punkt 13 visar att det
händer i verkligheten; inte innan.

### 15. Ingen UI för att rätta bransch för hand

`industrySource = "manual"` finns i schemat och klassificeraren rör aldrig ett
lead som redan har en bransch. Stödet finns, fältet går bara inte att redigera.
Ett fält i `LeadDetail` räcker.

### 16. Växelpanelen visas inte vid "Fel beslutsfattare"

Säljaren får ofta veta vem den rätta personen är, men `dmName` / `dmDirectE164`
går bara att fylla via växelsteget. Bortvalt för att inte bryta
ett-tryck-principen — lös det utan att lägga till ett obligatoriskt steg.

---

## P3 — data

### 17. 6 274 av 9 975 kontakter saknar förnamn

Det största kvalitetshålet. `firstName` är NULL och `name` bär bara efternamnet.
Manuset använder `firstNameOf` för `{kontakt}` och `{förnamn}` — **varannan
säljare läser alltså upp fel tilltalsnamn i öppningen.**

Går bara att laga med en omimport där Förnamn och Efternamn mappas till sina
egna kolumner. Matchning på org-nummer kompletterar tomma fält utan dubbletter.

### 18. 2 152 leads har hemsida men ingen bransch

Kvarvarande kvotblockering. Gemini ligger på gratisnivån: 20 anrop per dygn för
`gemini-2.5-flash` ≈ 108 dagar för resten. Åtgärd är fakturering på Google
Cloud-projektet, inte kod. Modellen kan bytas utan deploy via
`GEMINI_INDUSTRY_MODEL`; kör manuellt med `GET /api/cron/industry?limit=N` och
`CRON_SECRET` som bearer.

**Löst sedan loggen skrevs:** omimporten är gjord. Rankspåret gick från 18 leads
av 3 426 till **5 917 av 9 097**, och `seo.rank` ligger på 5 711. Den punkten var
den tyngsta i loggen och den är borta.

### 19. 69 växelsamtal matchar inget bolag

Väntat för samtal utanför ringlistorna, men följ siffran: många omatchade betyder
att kontakternas nummer inte är normaliserade. 69 av 580 är i överkant för
"privatsamtal och fel nummer".

### 20. Nej-orsakerna är åtta, tre används knappt

550 registrerade nej fördelar sig så här: INGET_BEHOV 367,
VILL_EJ_PRATA_SALJARE 101, TIMING 26, HAR_BYRA 18, NOJD_MED_ANNAN 15,
NEJ_INNAN_PITCH 12, HAR_INHOUSE 9, **PRIS 2**.

Schemats egen designnot säger att fler än sex orsaker gör att träffsäkerheten
kollapsar — säljaren väljer snabbt i stället för rätt. Fördelningen finns nu.
PRIS, HAR_INHOUSE och NEJ_INNAN_PITCH är kandidater att slå ihop, men gamla
rader ska stå kvar: loggen är oföränderlig.

---

## P4 — städning

- **`src/app/actions/import.ts` är död kod.** Inget anropar `importLeads` —
  verifierat med sökning över hela `src`. All import går via
  `/api/import-stream`. Filen saknar både hopslagningen per bolag och
  SEO-fälten. Radera den; två importvägar där bara den ena underhålls är en
  fälla som väntar.
- **`@dnd-kit/core`, `/sortable`, `/utilities` är oanvända** sedan kanban togs
  bort. Ta bort dem i ett pass där `package-lock.json` kan uppdateras samtidigt
  — annars avbryter Vercels `npm ci` på en låsfil som inte matchar.
- **`Product` / `DealProduct` är frånkopplade.** 4 produkter ligger i katalogen
  under Admin, inga radposter skapas, `DealProduct` refereras ingenstans i
  `src`. Antingen får de en ingång eller så ska de bort.
- **`/` → `/leads` → `/lists`.** Två hopp vid varje inloggning. Peka roten
  direkt på `/lists`.
- **`StatsView` visar dödtid i sekunder** på två ställen (`{avgIdlePerCall}s`,
  rad 324 och 370). `SettingsView` och cockpiten har `formatIdle`. Lämnades med
  flit — fast enhet i en tabellkolumn gör jämförelsen enklare — så det här är
  ett beslut att bekräfta, inte självklart en bugg.
- **~800 inline-stilar i levande komponenter.** Konvertera vy för vy till
  `.card` / `.panel` / `.menu` / `.modal` / `.btn-*`.
- **Ingen gallring av `TelephonyEvent`.** 591 rader — ofarligt än, men det finns
  ingen plan för när det blir 500 000.
- **Ingen inloggad vy är visuellt granskad** efter designomläggningen. Cockpit
  och leaddetaljen är sedda i kod, inte i drift.
- **Listor importerade före migration 010** tar inte med sig sina leads vid
  radering (`createdByImport` defaultar till `false`).
- **`deleteProduct` har samma brist som `deleteUser` hade.** Knappen i
  `AdminView` kör den utan `try/catch` och utan bekräftelse, så ett fel blir
  kraschsidan i stället för en rad text. `Product` har inga RESTRICT-relationer
  idag, men får `DealProduct` en ingång (se ovan) blir det samma fel som med
  användarna — och en produkt raderas fortfarande på en felklick.
- **Ingen `Activity`-rad skrivs när ett konto raderas.** Vem som raderade vem,
  och när, finns bara i minnet av den som klickade. Historiken flyttas till
  gravstenskontot utan att någonstans säga varifrån den kom.
- **Cockpitens tangentbordsgenvägar läcker genom varje lager utan textfält.**
  `onKey` ligger på `window` och har som enda grind att `e.target` är en input
  eller textarea. Återkomstklockan löser det för sin egen panel genom att fånga
  i capture-fasen, men samma läcka finns kvar i drawern, affärsrutan och varje
  framtida lager utan fält: ett tryck på "1" bokför ett samtal på bolaget under.
  Rätt fix är en gemensam grind i cockpiten, inte en capture-lyssnare per panel.
- **Återkomstklockan pollar var 60:e sekund per öppen cockpit.** Med tjugo
  säljare är det tjugo frågor i minuten efter data som ändras några gånger om
  dagen. Ofarligt nu, men samma sorts kostnad som presence-heartbeaten.

---

## Avklarat sedan punkterna skrevs

Stryks härmed ur listan — verifierat 2026-08-20:

- **Testerna är incheckade.** `npm test` kör fyra sviter: scheduler,
  script-resolver, history-merge och seo. Farhågan om "inget skyddsnät" gäller
  inte längre.
- **Omimporten är gjord** — se punkt 18.
- **Lynes skickar en sluthändelse** — se punkt 7.
- **`SERPER_KEY` är satt och verifierad**, rankspåret har körts skarpt.
- **Papperskorgen i admin fungerar.** Den kraschade på `ON DELETE RESTRICT` för
  varje konto som hade ett enda samtal eller pass bakom sig — alltså alla nio.
  Historiken flyttas nu till ett gravstenskonto och raden raderas på riktigt.
  Se `ARBETSLOGG.md` 2026-08-20.
