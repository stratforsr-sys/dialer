# Arbetslogg

Beslut, fallgropar och öppna punkter som **inte** går att läsa sig till ur koden.
Commit-meddelandena bär detaljerna — den här filen bär sammanhanget och det som
är kvar att göra.

Nyast först.

---

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
