# Arbetslogg

Beslut, fallgropar och öppna punkter som **inte** går att läsa sig till ur koden.
Commit-meddelandena bär detaljerna — den här filen bär sammanhanget och det som
är kvar att göra.

Nyast först.

---

## 2026-08-07 (senare) — Rank på hela beståndet

### Rättelse till anteckningen nedan

Påståendet att en omimport av `berikade_leads.csv` skulle lyfta rankspåret var
**fel**. Filen och databasen är i huvudsak olika bolag: av 3 426 leads matchar
286 på org-nummer och 679 på normaliserat namn — 2 461 finns inte i filen alls.
En omimport hade fyllt bransch på **71** leads och skapat 5 776 nya. Att lägga
till dem kan vara värt något i sig, men det löser inte rank för de befintliga.

### Den riktiga vägen: fråga Google i stället för att gissa

Rank mäts **aldrig** på bolagsnamnet. "Kulladals Snickeri AB" ligger etta på
sitt eget namn oavsett hur osynliga de är för en kund som söker hjälp. Rank
mäts på tjänstetermen, och hela svårigheten är att få fram den för varje bolag.

Tre källor, i fallande auktoritet, alla implementerade:

1. **Googles egen kategori**, via `/places` med "bolagsnamn + ort"
   (`serper-lead.ts`, `/api/cron/seo-leads`). En kredit per bolag. Ger också
   betyg, recensionsantal, telefonnummer, hemsida och adress.
2. **Bolagsnamnet** (`trade.ts`). Gratis, deterministiskt, ingen kvot.
3. **Sajttiteln**, som nivå 0 redan hämtat gratis.

Källa 2 och 3 körs av `/api/cron/keywords`, som också fyller `Lead.city` ur
adressen. **Kör den alltid före en betald körning.**

### Mätt utfall av gratiskörningen

    602 orter räddade ur adressfältet
    782 yrkestermer ur bolagsnamn, 101 ur sajttitlar
    rankbara leads:  18  →  1 116
    leads med sökord: 307 → 2 102

Noll krediter. Ordlistan gissar aldrig — matchar inget mönster blir det null,
och då hämtas ingen rank.

### Vad som återstår, och vad det kostar

    uppslag per bolag (alla 3 424)        ~3 424 krediter
    rankmätning på 1 314 segment          ~7 884 krediter i värsta fall
                                          (~5 000 realistiskt, tidigt stopp
                                           gav 32 av 48 i skarp mätning)

Gratisnivåns 2 500 räcker alltså till ungefär en tredjedel av ett varv. Två
vägar: betald Serper-plan, eller `?listId=` och bara den lista som ringas.

**Segmenteffektiviteten är dålig just nu** — 1 314 segment för 2 102 leads,
alltså 1,6 leads per sökning. Ordlistans termer är finkorniga och orterna
många. Görs uppslaget per bolag först blir segmenten färre och större, eftersom
Googles kategorier är mer standardiserade än ordlistans.

### Fallgrop som kostade 445 krediter

**En kö byggd på ett LYCKAT utfall betalar för misslyckanden i evighet.**

`lookupLeads` valde leads som saknade `gmb.category`. Ett bolag som inte finns
hos Google får aldrig någon kategori — det låg alltså kvar i kön efter att ha
slagits upp, och slogs upp igen vid nästa körning. Och nästa.

Mätt i skarp drift innan fixen:

    tre körningar à 150 uppslag
    kön flyttade sig 262 → 257
    445 krediter för 5 nya svar

Symptomet var att träffkvoten "kollapsade" från 85 % till 3 % mellan körning
ett och två. Den kollapsade inte — körning två och tre frågade om exakt samma
bolag som redan misslyckats.

Nu skrivs `gmb.lookup` (bool) **oavsett utfall**, och kön står på den. "Finns
inte hos Google" är ett lika giltigt resultat som en kategori och ska kosta
lika mycket att ta reda på: en gång.

Regeln generellt: **en anrikningskö ska stå på "har vi frågat?", aldrig på
"fick vi svar?"** Samma fälla finns i `/api/cron/industry` (kön är
`industry: null`) och i `/api/cron/services` (kön är avsaknad av
`seo.services`). Där är den gratis eftersom Gemini inte kostar per anrop på
gratisnivån — men blir den betald måste båda byggas om på samma sätt.

### Vercels 300-sekundersgräns dödade körningarna tyst

Uppslagen görs ett i taget och tar drygt en sekund styck, så `limit=300` slog i
taket. Funktionen dödades mitt i: skrivningarna fanns kvar men svaret försvann,
och det gick inte att se hur långt den kom. `lookupLeads` har nu en tidsspärr
på 260 sekunder och rapporterar att den stannade själv.

### Bieffekt: importfilen kan bli mycket tunnare

Med uppslag per bolag räcker **bolagsnamn + telefonnummer** i filen. Adress,
ort, hemsida, kategori, betyg, recensioner och telefon kommer från Google.
Två förbehåll: org-numret kommer inte därifrån och importen deduplicerar på
det, så utan org-nummer blir samma bolag två leads vid nästa uppladdning — och
bolag utan Google-profil får ingenting.

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

**Djupet hämtas sidvis.** Med tio träffar går det bara att säga "vi hittade er
inte", vilket prospektet med rätta hör som svammel. Med fem sidor går det att
säga "plats 47" — ett tal hen kan kontrollera. Hämtningen slutar så fort alla
bolag i segmentet är hittade eller Google tar slut, så de fem sidorna är ett
tak och inte en kostnad.

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

**Serper ignorerar `num`.** Uppmätt mot skarpt API: `num: 100` svarar med tio
träffar och drar en kredit. Djup får man bara via `page`, en kredit per sida om
tio — och **positionen börjar om på 1 varje sida**, så absolut placering är
`(sida-1)*10 + position`. Missas det blir varje bolag på sida två till fyra
plötsligt topp tio. Det här är samma fälla som gjorde att leadmotorns export
skrev ">20" på tio kontrollerade träffar; koden hade ärvt den rakt av innan
mätningen gjordes. `absolutePosition()` har egna tester.

**Lokala sökningar tar slut långt före 100.** "Rörmokare Malmö" har 27
organiska träffar totalt. Därför skiljer `seo.rank` på två fall: tog Google
slut säger uppgiften "syns inte alls i sökresultatet" (starkare, och sant),
annars "utanför topp N" där N är det djup vi **faktiskt** nådde — aldrig taket
vi siktade på.

**`places` finns inte i `/search`-svaret.** Verifierat: nyckeln saknas helt.
Maps-rutan kräver `/places`-endpointen. Det är orsaken till att `lokala_paketet`
var tomt i samtliga rader i leadmotorns export.

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

- [x] **SERPER_KEY satt i Vercel 2026-08-07** och verifierad mot skarpt API.
      Cirka 54 av 2 500 krediter förbrukade i valideringen. Kör **alltid**
      torrkörningen först — krediterna är engångs, inte per månad:
      `GET /api/cron/seo?dry=1` med `CRON_SECRET` som bearer.
- [ ] **Maps-matchningen träffar sällan för bolag utan hemsida.** Av 40 leads
      i valideringskörningen fick 2 betyg och recensionsantal. Utan domän
      matchas bolaget på normaliserat namn mot `/places`, och ett litet bolag
      som inte rankar i segmentets kartrutta finns helt enkelt inte i svaret.
      Vill man ha recensioner för dem krävs ett `/places`-anrop per bolag
      (namn + ort som fråga) i stället för per segment — en kredit styck.
      Filens `recensioner`-kolumn täcker 100 % och är gratis; ta den vägen först.
- [ ] **Rankspåret når 18 leads av 3 426. Åtgärden är en omimport, inte kod.**
      Mätt mot produktionen 2026-08-07:

          leads totalt                            3426
            varav hemsida                         2344
            varav bransch                          913
            varav ort                             2817
            varav bransch + ort  (mätbara)         307
            varav + hemsida      (RANKBARA)         18
            hemsida men ingen bransch             2326

      Sökordet är bransch + ort och byggs aldrig på en gissning — hellre tomt
      än "ni syns inte på X" följt av "ingen söker på X". Flaskhalsen är alltså
      `industry`, som saknas på 2 326 leads med hemsida därför att
      klassificeringen är kvotblockerad.

      `berikade_leads.csv` i leadmotorns mapp har **bransch och kommun ifyllt
      på 100 % av 6 723 rader**, varav 5 828 har hemsida. En omimport med
      `bransch` → Bransch och `kommun` → Stad/Ort tar rankspåret från 18 till
      tusentals leads — och tar samtidigt med rank, betyg, recensioner och
      kategori som `LeadClaim` **utan att kosta en enda kredit**. 2 940 rader
      har org-nummer och slås ihop med befintliga leads i stället för att
      dubbleras. Autogissningen känner igen alla kolumnnamnen sedan den här
      omgången.

      Gör det INNAN nästa Serper-körning. Att betala krediter för 307 leads när
      6 723 ligger gratis i en fil är fel ordning.
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
