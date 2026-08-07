# Arbetslogg

Beslut, fallgropar och öppna punkter som **inte** går att läsa sig till ur koden.
Commit-meddelandena bär detaljerna — den här filen bär sammanhanget och det som
är kvar att göra.

Nyast först.

---

## 2026-08-07 — SEO-spåret: rank, Google-profil, tjänster

Ingen migration. `LeadClaim` hade redan rätt form med `@@unique([leadId, key])`,
och `seo.rank` / `gmb.reviewCount` stod redan namngivna i schemats egen
kommentar — hela spåret ryms i befintliga tabeller. Produktionsdatabasen rörs
alltså inte, vilket är hela skillnaden mot ett vanligt arbetspass här.

### Vad som byggdes

**Serper ersatte DataForSEO.** `rank.ts` var en tom stub bakom
`DATAFORSEO_LOGIN`; den är borta. `serper.ts` gör samma jobb men
segmentbaserat: **ett anrop per bransch+ort, inte per företag.** Alla rörmokare
i Malmö konkurrerar om samma sökning, så SERP:en är gemensam och positionen
läses ur den per domän. Det är därför 2 500 gratiskrediter räcker till ett
bestånd som annars hade kostat tusentals.

**Djup 100, inte 10.** Med tio träffar går det bara att säga "vi hittade er
inte", vilket prospektet med rätta hör som svammel. Med hundra går det att säga
"plats 47" — ett tal hen kan kontrollera.

**Uppgifterna:** `seo.rank`, `seo.keyword`, `seo.competitor`, `seo.top3`,
`seo.rivals`, `gmb.rating`, `gmb.reviewCount`, `gmb.category`,
`gmb.localRank`, `gmb.localLeader`, `seo.services`.

**Importen** tar emot samma uppgifter ur en redan berikad fil. De landar som
`LeadClaim` med `source = "import"` och lägre konfidens än en hämtning — filen
kan vara veckor gammal och vi vet inte hur den togs fram. **Filen fyller luckor,
den skriver aldrig över en hämtning.**

**Cockpiten** har en ny `SeoPanel` bredvid `PitchPanel`. De gör olika saker med
flit: PitchPanel är en pitchmotor (tre svagheter, filtrerade på säljstyrka),
SeoPanel är ett uppslagsverk som visar **även de bra siffrorna**. Ett bolag som
ligger tvåa och har 4,9 i betyg ska synas som just det — att dölja det för att
det inte går att sälja på gör verktyget till en partsinlaga, och säljaren
märker det.

**Tjänsteextraktionen** (`services.ts` + `/api/cron/services`) är byggd men
förväntas ligga vilande, se Gemini-kvoten nedan. `gmb.category` fyller fältet
under tiden.

### Fallgropar som kostade tid

**">20" får ALDRIG bli talet 20.** Berikade filer skriver den som hittades som
"14" och den som inte hittades som ">20" eller ">100". Tolkas förbehållet som
ett tal påstår cockpiten att bolaget ligger tjugonde när sanningen är att vi
inte hittade dem alls — och säljaren säger något kontrollerbart fel. `parseRank`
skiljer dem åt och har egna tester för varje stavning som förekommer i
verkligheten.

**`writeClaims()` går inte att använda i importen.** Den gör fyra rundturer per
lead, vilket är rätt för en anrikning på femtio och helt fel för en fil på
sjutusen: samma jobb blir tjugotusen anrop mot Turso. `import-claims.ts` har en
bulkväg på sex satser per sats om femhundra bolag.

**Autogissningen kände inte igen `foretag` och `kommun`.** Två stavningar som
leadmotorns egna exporter använder, och bolagsnamn är ett *obligatoriskt* fält
— hela filen hade behövt mappas för hand. Fanns sedan tidigare, hittades av de
nya testerna, lagat.

**`hostOf` byggde på "HTTPS://…" till "https://HTTPS://…".** Schemakontrollen
var skiftlägeskänslig. Dessutom saknades punktkontrollen som `normalizeUrl` har,
så "—" blev ett värdnamn som jämfördes mot riktiga domäner.

### Öppna punkter

- [ ] **Ingen SERPER_KEY är satt.** Hela spåret ligger inaktivt tills den finns
      i Vercel. Gratisnyckel utan kreditkort på serper.dev. Kör alltid
      torrkörningen först — krediterna är engångs, inte per månad:
      `GET /api/cron/seo?dry=1` med `CRON_SECRET` som bearer.
- [ ] **Sökordet kräver bransch OCH ort på leadet.** Saknas någondera finns
      inget sökord och ingenting hämtas — hellre tomt än "ni syns inte på X"
      följt av "ingen söker på X". Eftersom branschklassificeringen är
      kvotblockerad (se nedan) täcker rankspåret idag bara den minoritet som
      har bransch. Torrkörningen rapporterar `leadsWithoutKeyword`.
- [ ] **Sökvolym är medvetet bortvald.** Serper säljer inte sökvolym — de
      levererar SERP-resultat, inte hur många som söker. Vill man ha "så här
      många söker på tjänsten i deras stad" krävs DataForSEO:s Keywords Data,
      Google Ads Keyword Planner (kräver konto med aktiv annonsering för exakta
      tal) eller Keywords Everywhere. Inget fält är reserverat i schemat.
- [ ] **`/api/cron/seo` ligger utanför `vercel.json`.** Med flit: en anrikning
      som tömmer ett engångskonto medan ingen tittar är värre än ingen
      anrikning alls. Routen anropas för hand.
- [ ] **Gemini-kvoten blockerar även tjänsteextraktionen**, samma nyckel och
      samma dygnstak som branschklassificeringen. `GEMINI_SERVICES_MODEL` finns
      för att kunna lägga den på en annan modell och därmed ett annat tak.
- [ ] **`src/app/actions/import.ts` är död kod.** Inget anropar `importLeads`;
      all import går via `/api/import-stream`. Den saknar sedan tidigare både
      hopslagningen per bolag och nu SEO-fälten. Radera eller synka — att ha
      två importvägar där bara den ena underhålls är en fälla.

## 2026-08-06 — Import, manus, cockpit, dispositioner, bransch

Commits `a89a462`..`d422dc7`. Migrationer 008–013, alla applicerade mot Turso.

### Vad som byggdes

**Importen** tar nu emot förnamn, efternamn, adress, stad, anställda,
omsättning, bransch och SNI-kod. Telefonnummer normaliseras till E.164 vid
importen (`toE164`) — det gjordes tidigare inte alls, och eftersom cockpiten
renderar ringknapparna på E164-fälten saknade varje nyimporterad kontakt
klickbart nummer tills någon körde `prisma/backfill-e164.mjs` för hand.

**Manuset** visas ordagrant. Radbrytningar och blankrader är en del av manuset;
alla vyer som renderar manustext **måste** ha `whitespace-pre-wrap`, annars
klämmer HTML ihop styckena till en mening. `{kontakt}` ger tilltalsnamnet, inte
hela namnet — man säger "Hej Anders", inte "Hej Anders Svensson". `{fullnamn}`
finns för de fall hela namnet behövs.

**Cockpiten** visar bransch, ort, adress, anställda, omsättning och för-/efternamn.
De fanns i databasen men hämtades aldrig: `leaseNextLeads` har en explicit
`select` som måste utökas när nya kolumner tillkommer. **Glöm inte den.**

**Dispositioner:** `WRONG_DM` ("Fel beslutsfattare", tangent 4 under utfall),
`NEJ_INNAN_PITCH` (7) och `VILL_EJ_PRATA_SALJARE` (8) under "Varför nej?".
Den sista ger 30 dagars vila via `DialerConfig.retryDaysNoSalespeople` —
leadet spärras alltså inte, det vilar.

**Radering av ringlista** tar med sig de leads listan skapade men lämnar kvar
dubbletter som fanns innan. Avgörs av `LeadOnList.createdByImport`.

### Fallgropar som kostade tid

**Vercels GitHub-integration missade en push.** Commit `99e1035` låg korrekt på
GitHub men fick aldrig någon build, och det såg ut som en kodbugg i flera
minuter. Verifiera alltid att deployen faktiskt gick igenom:

    npx vercel inspect https://dialer-five.vercel.app     # vilken deploy är live
    npx vercel --prod --yes                               # deploya manuellt

**Två kolumner till samma systemfält skrev över varandra i importen** — sista
vann. Mappades både "Förnamn" och "Efternamn" till Kontaktnamn försvann
förnamnet tyst. Lagat: värden samlas per fält, namnkolumner sätts ihop.
Skadan på befintlig data står kvar, se nedan.

**Enum-värden behöver ingen migration.** `noReason` och `outcome` är fria
TEXT-kolumner utan CHECK-villkor i SQLite — verifierat mot produktionsschemat.
Att lägga till ett enumvärde i `schema.prisma` räcker.

### Öppna punkter

- [ ] **Omimport krävs.** Alla 2914 kontakter har `firstName = NULL` och `name`
      satt till enbart efternamnet — förnamnen skrevs aldrig till databasen och
      går bara att få tillbaka genom att importera filen igen, med Förnamn och
      Efternamn mappade till sina **egna** val. Samma sak för anställda och
      omsättning: 0 leads har dem, importen kördes innan kolumnerna fanns.
      Omimport matchar på org-nummer och kompletterar tomma fält utan att skapa
      dubbletter.
- [ ] **Gemini-kvoten blockerar branschklassificeringen.** Nyckeln ligger på
      gratisnivån: `GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20`
      anrop **per dygn** för `gemini-2.5-flash`. 2514 leads kvar ≈ 126 dagar.
      Alla nyare/lite-modeller ger `404 no longer available to new users` för
      den här nyckeln. Åtgärd: slå på fakturering på Google Cloud-projektet.
      Volym för hela beståndet ≈ 2,9 M input-token + 40 k output-token.
      Modellen kan bytas utan deploy via `GEMINI_INDUSTRY_MODEL`.
      Kör manuellt: `GET /api/cron/industry?limit=N` med `CRON_SECRET` som bearer.
      `?redoNames=1` kör om de som bara gissats ur bolagsnamnet.
- [ ] **Ingen UI för att rätta bransch för hand.** `industrySource = "manual"`
      finns i schemat och klassificeraren rör aldrig leads som redan har en
      bransch, så stödet finns — men fältet går inte att redigera i gränssnittet.
- [ ] **Växelpanelen visas inte vid "Fel beslutsfattare".** När säljaren hamnar
      hos fel person får hen ofta veta vem den rätta är, men `dmName` /
      `dmDirectE164` går bara att fylla i via växelsteget. Medvetet bortvalt för
      att inte bryta ett-tryck-principen i dispositionen.
- [ ] **Nej-orsakerna är åtta stycken.** Schemats egen designnot säger att fler
      än sex gör att träffsäkerheten kollapsar — säljaren väljer snabbt i
      stället för rätt. Titta på fördelningen om några veckor och slå ihop det
      som knappt används.
- [ ] **Listor importerade före migration 010** tar inte med sig sina leads vid
      radering. `createdByImport` defaultar till `false` för befintliga länkar,
      vilket är den försiktiga tolkningen.
