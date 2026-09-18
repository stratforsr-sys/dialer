# Arbetslogg

Beslut, fallgropar och öppna punkter som **inte** går att läsa sig till ur koden.
Commit-meddelandena bär detaljerna — den här filen bär sammanhanget och det som
är kvar att göra.

Nyast först.

> **`ATT_GORA.md`** bredvid den här filen samlar alla öppna punkter från hela
> loggen i en prioriterad lista, avstämd mot koden och produktionsdatan
> 2026-08-20. Den här filen är fortfarande källan till *varför* — den andra
> svarar snabbast på *vad som är kvar*.

---

## 2026-09-18 — Ett bolag låg i fem mappar, och vilan gällde bolaget

Beställt: *"samma kunder dyker upp igen och igen för samma person … när en
person ringer på en annan lista och sen får en ny lista där det finns kunder
som han har ringt förut på den andra listan då får han upp dem."*

Hypotesen stämde, och den gick att räkna på.

### Mekaniken

`leaseNextLeads` filtrerar och vilar **per bolag** — `nextActionAt`,
`attemptCount`, `retired` sitter alla på `Lead`. Mappen är bara en `JOIN` som
avgör vilka bolag som är valbara. Ett bolag i tre mappar är alltså vilande i
alla tre samtidigt, och kommer tillbaka i den mapp säljaren råkar sitta i när
vilan gått ut. Sitter hen i en ny lista ser hela listan ut att bestå av bolag
hen redan ringt.

Mätt i produktionen innan något rördes:

    22 371  leads
    24 259  LeadOnList-rader
     1 421  bolag i fler än en mapp  (1 029 i två, 324 i tre, 61 i fyra, 7 i fem)
     1 888  överflödiga mapprader
     1 085  av de 1 421 hade redan ringts

       161  bolag ringda av SAMMA säljare i fler än en mapp
              Fredrik 118, Mick 16, Vlado 13, Edvin 12, Zen 1, Josef 1
     11–43  sådana omtagningar per dag, hela september, oavbrutet

Överlappet är inte slumpmässigt — det är delmängder:
`leads_bygg_hantverk` ligger till 541 av 599 inuti `hantverkare_5000_alla`,
och `test_stad_fastighetsservice` till **502 av 502** inuti `Blandad lista`.
Fredriks värsta par var `Clicknet Lista 1` → `leads_bygg_hantverk`, 55 bolag.

### Vad som INTE var fel, mätt så att nästa session slipper gå om det

- **Trappan från migration 030 håller.** Av 2 055 samtal på sju dagar var
  1 688 första samtalet på bolaget. Av de 156 omtagningarna inom ett dygn
  följde **103 på en bokad återkomst** (alltså ett löfte som infriades) och
  43 på `NO_ANSWER`, som ska vila 20 timmar. Ingen fast vila kvar att laga.
- **Dubbla lead-RADER var marginalen.** 156 grupper, men bara **4** fall där
  samma säljare ringt två rader för samma bolag. Nästan hela problemet var
  samma rad i flera mappar.
- **Däcket läcker fortfarande inte mellan mappar.** Kontrollerat igen.

### Tre ändringar, i den ordningen

**1. `scripts/avdubbla.ts` städade beståndet.** Torrkörning är förval; den
skriver en säkerhetskopia i `backups/` oavsett. Två steg, och ordningen är inte
valfri — steg 1 flyttar mapptillhörigheter och kan därmed skapa nya
flermappsbolag:

- **Samma bolag på flera lead-rader slås ihop.** Identiteten importeras från
  `lib/lead-identitet` — `orgNyckel`, annars `namnOrtNyckel` — och skrivs
  **inte** om i skriptet. En andra tolkning av "samma bolag" är precis den
  fällan den här loggen varnar för. 156 grupper, 164 rader raderade, **0
  avvisade** (ingen namn+ort-nyckel bar två olika org-nummer).
- **Samma bolag i flera mappar städas till en.** Mappen bolaget först laddades
  upp i behåller det: lägsta `LeadOnList.addedAt`, med mappens `createdAt` som
  avgörare vid lika och `createdByImport` sist. 2 022 mapprader stryks.

**2. Importen länkar inte längre in bolag som redan finns.** Raden
`linkToList(existingGroups…, false)` i `/api/import-stream` var källan: varje
omimport la samma bolag i en mapp till. Uppgifterna ur filen skrivs på bolaget
som förut — det är hela värdet i en omimport — men mappen det redan ligger i
behåller det. Importrapporten har en egen räknare, `kvarIUrsprunglig`, och en
egen ruta: en fil på 1 000 rader som ger en mapp på 600 ska förklara sig på
skärmen, inte se ut som ett bortfall.

**3. Migration 031 gör regeln till ett villkor.** `CREATE UNIQUE INDEX` på
`LeadOnList.leadId`. Utan den är "ett bolag, en mapp" en överenskommelse mellan
två kodställen som nästa ändring kan bryta tyst.

### Fallgropar som kostade tid

**`LeadClaim.leadId` är en främmande nyckel mot `LeadDossier.leadId`, inte mot
`Lead.id`** — och `PRAGMA foreign_keys` är **PÅ** i den här databasen
(kontrollerat, inte antaget). Första versionen av hopslagningen flyttade
uppgifterna före dossiern och hade fallit på nyckeln mitt i transaktionen, på
246 dossierer och 1 397 uppgifter. Ordningen är nu: dossiern först, uppgifterna
sedan, kvarvarande dossierer sist.

**En `DoNotCall`-rad får aldrig raderas.** `leadId` är UNIQUE, så två spärrar
kan inte peka på samma lead — men en spärr är ett besked från bolaget och får
inte försvinna i ett städjobb. Har överlevaren redan en nollas den andras
`leadId` i stället; raden lever vidare på `orgNumber`, som däckets spärrfilter
matchar på just för att överleva att leadId försvinner.

**Samtalshistoriken måste ärvas, annars ringer städningen upp folk.** Det
farliga fallet är att den äldsta raden är oringd och den andra ringdes i går:
utan arv hamnar det hopslagna bolaget överst i däcket som obearbetat. 29 av 156
grupper såg precis så ut. `lastAttemptAt` tar max, vilan tar den **längsta** av
de två, och `nextActionAt = NULL` får aldrig stå kvar på ett bolag som ringts —
NULL betyder "aldrig ringd" och sorterar först.

**`attemptCount` tar MAX, inte summan.** Summan är sannare om hur många gånger
bolaget faktiskt ringts, men hade slagit bolag i taket i samma sekund som de
slogs ihop — och ett lead över `maxAttempts` serveras aldrig mer. Ett städjobb
får inte pensionera bolag i tysthet.

**Indexet ligger bara i SQL, inte i `schema.prisma`.** En `@@unique([leadId])`
där gör relationen ett-till-ett i Prismas ögon: `Lead.lists` blir `LeadOnList?`
i stället för `LeadOnList[]`, och varje `lists: { some: { listId } }` i koden
slutar kompilera. Regeln hör hemma i databasen; typerna ska inte ritas om för
den. Noten står i schemat så att nästa läsare inte tror att indexet saknas.

### Följder som är avsiktliga och inte ska läsas som fel

**720 bolag hamnar i mappar som ingen säljare har tillgång till** — 374 i
`test_stad_fastighetsservice`, 71 i `Nya bolag från 2025 till 2019`, 57 i
`sokning_Clicknet2`. 412 av dem är fortfarande ringbara. Regeln "första mappen
behåller bolaget" beställdes uttryckligen och följdes bokstavligt; alternativet
— att bara mappar i bruk får vinna — valdes bort. **Åtgärden är en rad i
`ListAccess`, inte en ny körning:** ge säljarna tillgång till mapparna så är de
tillbaka i rotationen samma sekund.

**Att radera en mapp betyder något nytt.** `keptDuplicates` i `deleteList` var
"ligger kvar" så länge bolaget låg kvar någon **annanstans**. Nu finns ingen
annan mapp: de blir mapplösa — kvar i registret, sökbara, öppningsbara med ⌘K,
men ingen rotation delar ut dem. Störst exponering är
`sokning_Clicknet2_2026-08-04`, där alla 2 167 rader bär `createdByImport = 0`
(de skrevs före migration 010). Meningen står nu i bekräftelsen på skärmen.
`keptInOtherLists` är permanent 0 och står kvar för att säga varför.

**Summan över mappar minskar.** 24 259 → 22 237 mapprader. Inget bolag
raderades utom de 164 dubblettraderna; resten bytte inte plats, de slutade
ligga på två ställen.

### Sidofynd

**Två bolag har två öppna återkomster var efter hopslagningen.** `Fix & Fint
Uppland AB` (Zen 17 aug, Edvin 9 sep — båda förfallna) och `Pureflow
Ventilation AB` (Fredrik två gånger, jan 2027). Städningen skapade dem inte —
två löften låg redan på var sin lead-rad — och skriptet avbokar **inte** det
ena. En avbokning kräver ett skäl och är ett beslut om bolaget; ett städjobb
får inte ta ett löfte som en människa gav. Skriptet varnar i stället.

### Öppna punkter

1. **Ge säljarna tillgång till de fyra mapparna** om de 412 ringbara bolagen
   ska tillbaka i rotationen. Se ovan.
2. **Avboka det ena löftet** på de två bolagen ovan, i klockan, med skäl.
3. **`test_stad_fastighetsservice` är 100 % en delmängd av `Blandad lista`.**
   Den heter "test", ingen säljare når den, och den äger nu 368 bolag. Antingen
   ska den bemannas eller avvecklas — men avvecklas den med `deleteList`
   blir 344 av bolagen mapplösa, se ovan.
4. **Omimporten av de nummerlösa listorna** står kvar sedan 2026-09-16 och är
   opåverkad av det här passet — utom att den nu är billigare: en omimport
   skapar inte längre dubbletter i en ny mapp.

---

## 2026-09-16 — Mapparna var slut, men däcket delade ut repriser i stället för att säga det

Beställt: *"det kanske är dubbletter för flera av säljarna får upp samma
företag som de har ringt men utan utfallen som står i cockpit … en säljare hade
30st igår."*

### Det var inte dubbletter

Räknat först, eftersom hypotesen gick att motbevisa på tre frågor. Av 20 156
leads:

    229  överflödiga rader på samma bolagsnamn
    320  överflödiga rader på samma telefonnummer
     65  överflödiga rader på samma org-nummer NORMALISERAT
          (`556677-8899` och `5566778899` är olika strängar, och
           `orgNumber` är unik som sträng — så den vägen finns)

Överlappande, alltså ~400 bolag. Och samtliga skapade i augusti: noll nya
dubbletter sedan 9 september. Det räcker inte till 30 på en dag.

Fler spår som mättes och föll, så att nästa session slipper gå om dem:

- **Omtagningar ur däcket**: 17–20 per dag, stabilt i tre veckor. Ingen
  försämring att hitta.
- **Ringda bolag överst i kön** (`nextActionAt = NULL`, som sorterar först i
  SQLite): 0. Regeln från 2026-08-26 håller.
- **Spöken av `Lead.callbackAt`** utan öppen `Callback`-rad — de hade sorterats
  först av ORDER BY:s första nyckel: 0. Ekot underhålls.
- **`noAnswerStreak`** stämmer mot samtalshistoriken på alla utom 16 leads.
  Trappan från migration 030 är alltså rätt laddad och behöver ingen backfill.
- **Släppta leases** hamnar sist, inte först: `releaseLeases` går via Prismas
  `updateMany`, som tillämpar `@updatedAt`, och sista sorteringsnyckeln är
  `updatedAt ASC`. En omstartad cockpit ger alltså nya bolag, inte samma.

### Vad det faktiskt var

Fyra mappar hade inte längre något ringbart arbete kvar — bara repriser.
Mätt 2026-09-16, ringbara bolag per mapp:

    Endast Städföretag (kanske)   523 ringbara, varav 521 REDAN RINGDA
    leads_bygg_hantverk           176 ringbara, varav 176 REDAN RINGDA
    test_stad_fastighetsservice   306 ringbara, varav 175 redan ringda
    hantverkare_5000_alla       2 250 ringbara, varav 1 003 redan ringda

Och **noll** av de ringbara bolagen i de mapparna hade ett telefonnummer. En
säljare i `Endast Städföretag` kunde inte få något annat än ett bolag hen redan
ringt, på ett kort utan nummer.

Det är den andra halvan som gör det osynligt: **numret sparas aldrig.** Av de
840 bolag som ringts i `Endast Städföretag` har **35** ett nummer på en
kontaktrad. Säljaren slår upp numret i en annan flik, ringer på en annan
telefon, och systemet får aldrig se det. När vilan går ut kommer bolaget
tillbaka med tomt telefonfält — det *ser ut* som ett obearbetat bolag. Det var
det säljarna beskrev som "samma företag, utan utfallen".

Kedjan alltså: fyra listor importerade utan telefonkolumnen → säljaren slår upp
numret externt → numret sparas aldrig → vilan går ut → samma tomma kort igen →
ny uppslagning. Med 20 timmars vila (före migration 030) blev det varje dag.

### Vad som ändrades

Ett villkor i `leaseNextLeads`, speglat i `deckStatus` och i
`lib/deck-state.ts`: **ett bolag som redan bearbetats och fortfarande saknar
nummer delas inte ut.**

Grenen är tvådelad med flit, och halva den är lätt att tappa: ett
**obearbetat** bolag utan nummer är fortfarande ringbart. Uppslagningen ÄR
arbetet, `AddNumberCard` finns för just det, och filtret på kontaktrad som togs
bort 2026-08-25 gjorde 986 av 1 000 bolag osynliga. `scripts/test-deck-state.ts`
bevisar båda leden.

Ingen skrivning, ingen migration, ingen pensionering. Raden rörs inte: bolaget
står kvar i mappen, går att söka upp, går att öppna med ⌘K — och kommer
tillbaka i rotationen i samma sekund som ett nummer finns. Filtret läker sig
självt när datan lagas, vilket är hela skälet till att det är ett filter och
inte en `retired`-flagga.

**3 497 bolag lämnar rotationen.** Följden är avsiktlig och ska inte läsas som
ett fel: `leads_bygg_hantverk` går från 176 ringbara till 0 och `Endast
Städföretag` från 523 till 1. De mapparna säger nu "slut" med en räknad
förklaring i cockpitens tomläge, i stället för att mala samma bolag. Det är
sant, och det är vad framstegsmätaren redan försökte säga.
`hantverkare_5000_alla` behåller sina 1 243 obearbetade.

### Varför "spara varje nummer som rings" inte byggdes

Det var förslaget i första svaret och det var fel. Säljaren ringer inte genom
appen — numret slås upp externt och slås in på en telefon, så det finns ingen
händelse att fånga. Det enda som skulle fungera är att **fråga** efter numret,
och det är ett nytt steg i dispositionsflödet. Flödet delas med
`CallbackDisposition` med flit, och ett steg som skiljer dem åt ger statistik
som inte går att jämföra. Den ändringen ska beställas, inte smygas in. Se
öppna punkter.

### Sidofynd, inte åtgärdade

- **En femte och en sjätte lista importerades utan telefonkolumn.**
  `stadforetag_1000_etablerade` 2026-09-15 13:05 (1 000 bolag, **25** med
  nummer) och `blandad_tak_maleri_flytt_786` under natten till 16:e.
  Importspärren från 2026-09-15 larmade — den kräver ett kryss för att gå
  vidare — och kryssades i. Spärren fungerar alltså; den är bara inte en
  vägg. 904 av de 930 oringda bolagen i den femte listan serverades och
  övergavs utan ett enda samtal samma eftermiddag.
- **Edvins cockpit startade om 46 gånger den 14:e och 47 den 15:e**, mot 4–13
  tidigare. 35 av 94 sessioner utan ett enda samtal; ~900 bolag leasades och
  lämnades tillbaka på två dagar. Orsaken är inte funnen. Det ger inga
  repriser (se `updatedAt`-noten ovan) men det är slöseri och något är fel.
- **82 förfallna återkomster ligger i Edvins klocka**, äldsta från 31 augusti.
  Josef 53 (äldsta 13 augusti, kontot ringer inte längre), Zen 28. De lämnar
  aldrig klockan av sig själva — bara ett samtal eller ett släpp tar bort dem.
- **`.env.prod` var inte gitignorerad.** Filen skapas av
  `vercel env pull` varje gång produktionsdatan ska frågas och bär riktiga
  Turso-nycklar. Tillagd i `.gitignore` i samma commit.

### Öppna punkter

1. **Omimport av de sex nummerlösa listorna** är fortfarande den enda riktiga
   lösningen — nu ~7 200 bolag plus de två nya listorna. Kräver filerna från
   leadkällan. En import som bär ett nummer häver både pensioneringen
   `inget_nummer` och det nya filtret, automatiskt.
2. **Fråga efter numret i dispositionen?** Se ovan — ska beställas, inte
   antas. Utan den fortsätter varje bearbetat bolag att tappa sitt nummer.
3. **Varför startar Edvins cockpit om?** Mät innan något byggs.
4. **Trappan går att utvärdera först 2026-09-19.** Den gick live 09:24 den
   15:e, och migration 030 lät pågående vilor vara med flit — bolagen som
   vilar nu kommer tillbaka en gång till på gammal takt. Jämförelsetal, tid
   mellan två samtal på samma bolag, tre veckor bakåt mätt 2026-09-16:
   477 / 313 / 186 / 110 på under 1 dygn / 1–2 / 2–4 / 4–8, där 149 av
   "1–2 dygn" var av en annan säljare.

---

## 2026-09-15 (kväll) — Utfallen följde mappen, inte bolaget

Beställt: *"Om det är en lista som jag importerar och vissa uppdateras så måste
utfallen hänga med i den listan också, det gör dem inte idag."*

Fyra oberoende fel, alla räknade i produktionsdatan innan något rördes.

### 1. Mappvyn läste aktivitetsloggen

Kolumnen "Senaste samtal" i `/lists/[id]` hämtades ur en `Activity` av typ
`CALL`. Den skrivs bara när säljaren lämnat en anteckning — medvetet, en rad
per samtal hade lagt 150 rader per säljare och dag i en logg vars enda syfte är
att gå att läsa. Följden:

    6 445  leads hade ringts
      121  av dem hade en CALL-aktivitet     ← kolumnen var tom för 98 %
    7 894  samtal låg i CallAttempt
      132  aktiviteter fanns totalt

Utfallet visades inte alls. `Lead.lastResult`, `lastOutcome` och `lastNoReason`
speglas vid VARJE disposition och låg redan i payloaden `getList` skickade ut —
6 445 leads hade ett ifyllt `lastResult`. Vyn läste det bara aldrig.

### 2. Utfallet bokfördes på mappen, inte på bolaget

`CallAttempt.listId` är denormaliserad per mapp. När importen hittar ett
befintligt bolag på org-numret länkas det in i den nya mappen — men samtalen
pekar kvar på den gamla:

    mapp                              leads   ringda   utfall på ANNAN mapp
    hantverkare_5000_alla             3 749    2 389   604  (542 ringda innan de kom hit)
    test_stad_fastighetsservice         502      350   348  ← 69 % av mappen
    Endast Städföretag (kanske)       1 151      994   201
    Blandad lista: Städ/Verkstäder    1 702      695   183

      300  samtal pekade på en mapp där leadet inte längre låg
    1 556  samtal låg på bolag som finns i flera mappar samtidigt

**Beslut: `listId` skrivs aldrig om.** Den betyder "var säljaren satt när hen
ringde" och är riktig som sådan — historiken är oföränderlig här. Mappens vyer
och statistik joinar i stället via `LeadOnList`: *bolagen som ligger i mappen
nu, och allt som hänt dem*. Ingen migration, ingen omskrivning av 7 894 rader.

Följden är att ett samtal på ett bolag i tre mappar räknas i alla tre. Det är
avsiktligt — varje mapp svarar sant om sina egna bolag. **Summan över mappar är
därför inte lika med totalen, och den summan ska aldrig bildas.**

### 3. Ingen statistik per ringlista fanns

`stats.ts` hade sex funktioner, alla per säljare och dag. Inte trasigt —
obyggt. `/stats` har nu en mappväljare (`?lista=`) som går genom `listFilter`,
alltså via `LeadOnList`. Ringpassen filtreras **inte** på mapp: ett pass är en
tid vid skärmen och kan spänna över flera mappar, så fluffminuterna hade
räknats i var och en av dem. En rad i vyn säger det.

### 4. Importen kunde bara matcha på råtext i org-numret

Två hål, båda med samma följd — det gamla leadet blev kvar med samtalen och ett
nytt kom in i mappen tomt.

`5595230201` och `559523-0201` är samma bolag men olika strängar, och
`Lead.orgNumber` är UNIQUE på strängen. **83 dubblettgrupper**, 46 med ett ringt
och ett oringt lead. 345 leads bär dessutom tolvsiffriga nummer med sekelprefix.

Och **8 729 av 21 131 leads (41 %) saknar org-nummer helt** — de kunde aldrig
matchas. 94 tomma kopior av redan ringda bolag låg i datan.

`src/lib/lead-identitet.ts` ger två nycklar. `orgNyckel` strippar allt utom
siffror och fäller sekelprefixet; kortare än tio siffror ger `null`, eftersom de
fyra felmappade listorna fick värden som `9` och `10` i kolumnen och en
tvåsiffrig nyckel hade slagit ihop alla bolag som råkat dela skräpvärde.
`namnOrtNyckel` är reserven när numret saknas.

**Reservnyckeln mätt mot hela beståndet innan den byggdes:**

    8 731  leads utan giltig org-nyckel
    8 507  får en ENTYDIG namn+ort-nyckel   ← 97 % av luckan täckt
      224  saknar ort, förblir omatchbara

      187  flertydiga nycklar (382 leads)   → spärren avbryter, inget slås ihop
        0  av dem med olika org-nummer bakom

Noll verkliga felmatchningar i dagens data. Spärren står ändå kvar, och regeln
är asymmetrisk med flit: **en felmatchning slår ihop två bolags samtalshistorik
permanent, en utebliven matchning ger en dubblett som går att städa. Vid tvekan,
skapa nytt.** Nya leads skrivs dessutom med normaliserat org-nummer, så det
unika indexet börjar göra sitt jobb.

### Kvar att göra

De dubbletter som redan finns städas **inte** av det här passet — 46 par från
oformaterade org-nummer och 94 tomma kopior på namn. Att slå ihop dem är
oåterkalleligt och ska beställas separat. Org-numren finns, paren går att lista
med samma nycklar.

### Prov

`scripts/test-lead-identitet.ts` (25) och `scripts/test-utfall.ts` (25), båda i
`npm test`. Identitetsprovet är skevt med flit: fler fall kontrollerar att
nyckeln säger NEJ än att den säger ja.

---

## 2026-09-15 — Listan sa 5 %, säljarna fick cykelhandlare, kunderna ringdes varje dag

Beställt: *"Jag lägger in listor. Dem ringer kanske 2000 kunder på 2 veckor.
Men ändå står det att listan bara är tex 5% bearbetad, säljarna börjar då få
andra branscher helt plötsligt och samma kunder kommer om och om igen."*

Tre symptom, fyra oberoende fel. Alla räknade i produktionsdatan innan något
rördes — kodläsningen gav flera lika troliga hypoteser, som vanligt.

### 1. Framstegsmätaren mätte claim-lås

`getLists` räknade `freeLeads` på `Lead.claimedAt`, och stapeln var
`(total − free) / total`. Men `claimsLead` släpper låset på varje disposition
utom `CALLBACK_BOOKED` och `SOLD`. Stapelns TAK var alltså andelen öppna
återkomster plus kunder — den kunde aldrig visa arbete.

    6 242  leads ringda minst en gång
      440  av dem med lås kvar (384 öppna återkomster + 10 kunder + skräp)

    Clicknet Lista 1        visade  3 %   faktiskt ringt  47 %
    hantverkare_5000_alla   visade  4 %   faktiskt ringt  61 %
    Endast Städföretag      visade  7 %   faktiskt ringt  80 %
    leads_bygg_hantverk     visade  8 %   faktiskt ringt 100 %

Nyckeln är `lastAttemptAt`, inte `attemptCount`: taket nollställer den senare
och glömmer arbete. 133 leads skilde i Clicknet Lista 1. Samma fel styrde
statusetiketten och låset på "Starta dialer" — `freeLeads === 0` inträffar
efter migration 017 aldrig, så knappen låste aldrig fast den påstod sig kunna.

### 2. "Andra branscher" var etiketten, inte däcket

Däcket läcker inte mellan mappar — `leaseNextLeads` joinar alltid på
`LeadOnList.listId` och cockpiten kräver ett `listId`. Det kontrollerades
särskilt. Felet låg i datan: `resolveIndustry` låter filens fritextkolumn vinna
över SNI-koden, och leadverktygen skriver **sökkategorin** där.

Alla 1 151 bolag i `Endast Städföretag (kanske)` bar `industry = 'Stadforetag'`.
Bara 679 hade SNI 81. Resten fördelade sig på **24 huvudgrupper**: 142
bygghantverk, 73 landtransport, 65 husbyggnad, 27 bemanning, 22 detaljhandel.
Ur Edvins pass 2026-09-11, alla serverade som städföretag: Firefox bikes AB
(47632), Lighthouse Pingst AB (78201), Kärra VVS & Kakel AB (43221), LT Måleri
AB (43341).

SNI-koden fanns i databasen hela tiden och var rätt. Koden valde bort den.

**Beslut: visa båda, välj inte.** `sniAside` ger huvudgruppen när den säger
något annat än filens text. Att välja maskinellt går inte — "Elektriker" mot
"Bygghantverk" är en precisering, "Städföretag" mot "Detaljhandel" är en
motsägelse, och ingen regel skiljer dem utan en etikett-till-SNI-karta som
ingen orkar underhålla. Att låta SNI vinna rakt av hade dessutom DEGRADERAT
`hantverkare_5000_alla`, där filens text ("Elektriker", "Måleri", "VVS") är
bättre än huvudgruppen.

Det som saknades för admin var i stället en fördelning. Mappvyn har nu en
SNI-uppdelning som visas när mappen spänner över mer än en grupp.

### 3. Samma kunder: 20 timmar betyder "i morgon bitti"

`retryHoursNoAnswer` var en fast vila. `alignToSlot` flyttar ändå in tiden i
nästa ringpass, så åtta försök blev åtta arbetsdagar i rad. Tid mellan två
samtal på samma bolag, tre veckor:

    under 1 dygn   450 samtal   varav  40 av en ANNAN säljare
    1–2 dygn       296 samtal   varav 148 av en ANNAN säljare
    2–4 dygn       179 samtal   varav  59 av en ANNAN säljare

128 `BORTFALL` på fjorton dagar — fyra procent av alla samtal var någon som bad
att slippa bli kontaktad.

Och taket hade ingen utgång: `attemptCount = 0` vid taket, ingen räknare som
överlevde nollställningen, alltså åtta försök / trettio dagars vila / åtta
försök, i evighet. Det är också varför en mapp aldrig kunde bli färdig.

Migration 030 ger `retryBackoffFactor` (2,0), `retryHoursMax` (336 h) och
`maxRounds` (2), plus `Lead.roundCount`. Trappan blir 20 h → 40 h → 3,3 d →
6,7 d → 13,3 d → tak: ~54 dagar i stället för åtta. Vid sista varvets tak
pensioneras bolaget som `uttomd` — **utan spärr**, eftersom det inte bett om
något, det har bara aldrig svarat.

**Ingen läkning av `nextActionAt`**, till skillnad från migration 022. Där var
vilan direkt skadlig (ett nej ringdes om dagen efter); här är 20 timmar bara
för kort. Att skjuta 3 000 bolag framåt hade tömt däcket över en natt mitt i
ett säljpass.

### 4. Det dyraste: importen tappade numren, knappen brände bolagen

Hittades under jakten på nummer tre.

    hantverkare_5000_alla          3 749 bolag,  74 med telefonnummer
    Blandad lista (städ/verkstad)  1 702 bolag,  10 med telefonnummer
    Endast Städföretag (kanske)    1 151 bolag,  23 med telefonnummer
    leads_bygg_hantverk              599 bolag,  16 med telefonnummer

Kontaktraderna fanns men bar fel kolumn: `Contact.name` var tvåsiffriga tal
(hantverkare), femsiffriga postnummer (bygg) och tjänstekategorier —
"Fönsterputs", "Flyttstäd", "Byggstäd" — i städlistan. Ingen validering fanns
mellan `autoGuessMapping`s gissning och 5 000 skrivna rader.

Säljarna hade en enda väg vidare: "Inget telefonnummer". Den skrev en
**permanent** `DoNotCall` och raderade leadet.

    2 653  permanenta spärrar, 2026-08-28 → 2026-09-15, ~147 per dag
    2 413  av dem på org-nummer som inte längre finns som lead
      237  på org-nummer som FINNS — bolagen låg i en mapp, syntes i vyn,
           och delades aldrig ut eftersom spärren matchar på org-nummer
       29  på sitt eget lead (de hade historik och pensionerades i stället)

Org-nyckeln var vald med flit för att överleva en omimport — och stoppade
därmed även omimporten med korrekta nummer. Bolagen var oåterkalleligt borta.

**Felet var att två olika saker delade utgång.** "Bolaget vill inte bli
kontaktat" är ett besked från kunden och ska vara permanent. "Jag hittade inget
nummer i dag" är ett påstående om vår egen data och ska gå att motbevisa i
morgon.

`markNoPhoneFound` pensionerar nu i stället, utan spärr och utan radering.
`/api/import-stream` häver `inget_nummer` när filen bär ett nummer — och bara
det skälet; `fel_nummer`, `bortfall` och `sald` rörs aldrig av en import.
Migration 029 lyfte de 2 653 spärrarna (`expiresAt` satt, raden kvar som spår).
`DbImportView` blockerar nu import när mindre än halva filen har ett nummer.

### Att göra härnäst

- **Importera om de 2 413 raderade.** Org-numren ligger i
  `backups/2026-09-15_raderade_utan_nummer_orgnr.csv`. Filerna måste hämtas på
  nytt från leadkällan med telefonkolumnen med.
- **Importera om de fyra listorna med telefonnummer.** 7 200 bolag saknar
  fortfarande nummer. Importen häver nu pensioneringen automatiskt, så en
  omimport lyfter dem tillbaka i rotationen utan handpåläggning.
- **Rensa `Endast Städföretag (kanske)`.** 472 av 1 151 är inte städföretag.
  SNI-fördelningen i mappvyn visar vilka; det finns ännu ingen massradering.
- **`Contact.name` är skräp på ~7 000 rader.** Inget publicerat manus använder
  `{kontakt}`/`{förnamn}` i dag, så det är latent — men den dagen någon skriver
  "Hej {förnamn}" säger cockpiten "Hej Fönsterputs". Städas vid omimporten.
- **Fyra prov var röda på `main`** sedan migration 022 utan att någon märkte
  det: `CFG` i `scripts/test-scheduler.ts` saknade `retryDaysNo`, så
  `noRestDays` räknade NaN. `scripts/` är undantaget från `tsc`, så typen
  fångade det inte. Lagade i det här passet — kör `npm test`.

---

## 2026-09-15 — Affären kan byta säljare

Beställt: *"när man redigerar en affär så kan man också välja vilken säljare
det var så att man kan byta ut säljaren."*

### Vad som saknades

`Deal.createdById` sattes vid registreringen och gick aldrig att röra igen.
Den kolumnen är inte bokföring över vem som klickade — den är vad
`getDealsOverview` summerar ordervärde per säljare på, alltså underlaget för
provision. Stod den fel fanns exakt en utväg: radera affären och skriva in den
på nytt. Det kostar `closedAt`, anteckningen, kontaktuppgifterna och lämnar en
`DEAL_DELETED` i loggen som ser ut som en rättelse av något som var fel i
grunden — vilket det inte var.

Tre fall som gör det fel från början, alla sedda i datan: en säljare registrerar
på en kollegas inloggade skärm, en affär skrivs in i efterhand av någon annan,
och säljaren slutar varpå `deleteUser` flyttar affären till gravstenskontot.

### Vad som flyttar och vad som inte gör det

**Affären flyttar. Samtalet gör det inte.** `CallAttempt`-raden med utfallet
`SOLD` står kvar hos den som ringde samtalet — `getSellerStats` räknar samtal,
konverteringsgrad och fluff därifrån, och den statistiken beskriver ett arbete
som en annan person faktiskt utförde. `getDealsOverview` räknar på
`createdById` och följer alltså med bytet. Att de två säger olika saker efter
en rättelse är avsiktligt och står skrivet under rullistan i gränssnittet, så
att den som byter ser det innan hen sparar i stället för i en provisionsrapport
i efterhand.

### Beslut

- **Admin, inte säljaren.** Ligger i `updateDeal` bakom `requireDealAdmin`
  tillsammans med belopp och kontaktuppgifter. Samma skäl: ett underlag som den
  som tjänar på siffran kan skriva om är inget underlag.
- **Bytet skriver en egen rad**, `ActivityType.DEAL_SELLER_CHANGED`, med båda
  namnen, beloppet och titeln i metadata. Aktören är admin som gjorde det, inte
  någon av säljarna. Rättelsen ska gå att spåra — resten av `updateDeal` skriver
  ingen aktivitet, men resten flyttar inte heller pengar mellan två personer.
- **Ingen migration.** `Activity.type` är `TEXT NOT NULL` utan CHECK i SQLite
  (`init.sql`), så det nya enumvärdet krävde bara `prisma generate`. Samma
  förhållande som `noReason` och `outcome`.
- **Gravstenskontot går att flytta ifrån, aldrig till.** `getDealSellers`
  filtrerar bort det och `assertSeller` nekar det vid skrivning. Rullistan visar
  det ändå som ett låst alternativ när affären står där **nu** — utan det
  matchar `value` ingen `<option>` och webbläsaren visar första namnet i listan
  som om affären redan bytt hand.
- **Admin är med i listan.** En chef som stänger en affär själv är ovanligt men
  inte fel, och en lista som utelämnar den som faktiskt sålde tvingar fram ett
  felaktigt val.
- **Avbryt nollställer valet.** Ett byte som ångrats låg annars kvar förvalt
  nästa gång redigeringen öppnades och hade följt med på en sparning som gällde
  kontaktuppgifter.

### Var det inte syns

Affärssidans historik (`LeadHistory`) hämtar bara `NOTE` — dess metadata-form
är `{ note }` och komponenten delas med cockpiten. Säljarbytet syns därför på
**leadsidan** (`/leads/[id]`), som är hela loggen. Att få in det i
`LeadHistory` kräver att entry-formen bär fler typer än två; inte gjort.

---

## 2026-09-10 (sist) — Ett manus kan riktas till en enskild säljare

Beställt: *"jag vill kunna lägga ett manus till en speciell person, så att bara
en person kan se det manuset som jag väljer då."*

### Varför mappen inte räckte

`ScriptTemplate.listId` finns sedan 019 och avgränsar ett manus till en mapp.
Det räcker för en kampanj, men en mapp delas av alla som har åtkomst till den —
den minsta grupp som gick att träffa var alltså "alla som ringer i bygg_5000".
Ett manus skrivet åt en enskild säljare, för att han ska öva en viss öppning,
hade ingen väg in i systemet.

`assignedToId` (migration 028) är personnivån. NULL = alla säljare, satt = bara
den säljaren.

### Fyra nivåer, och den mest specifika ersätter de andra helt

    1. mitt manus i den här mappen   assignedToId = jag,  listId = mappen
    2. mitt manus, alla mappar       assignedToId = jag,  listId = NULL
    3. mappens manus                 assignedToId = NULL, listId = mappen
    4. det allmänna                  assignedToId = NULL, listId = NULL

Nivå 3 och 4 är exakt regeln från 026. De två nya lägger sig ovanpå, och de
**ersätter** av samma skäl som mappregeln gör det: två manus på skärmen
samtidigt är samma sak som inget manus, för ingen läser två alternativ mitt i
ett samtal. Beställaren fick frågan med det andra alternativet uppskrivet — ett
extra block bredvid de vanliga — och valde ersättning.

Person och mapp går att kombinera; det var också ett uttryckligt val. Priset är
fyra nivåer att hålla isär när något inte visas som väntat, och motvikten är att
räckvidden står i klartext i redigeraren (`scopeText`) i stället för att behöva
läsas ut ur två rullistor.

### Var gallringen ligger

**Andras personliga manus filtreras bort i frågan mot databasen**, inte i
utsorteringen efteråt. Texten ska aldrig lämna databasen till fel säljare
oavsett vad koden ovanför gör med raderna.

Två fällor i den frågan, båda undvikna med flit:

- **Två `OR` på samma nivå i Prisma skriver över varandra.** Villkoren ligger
  därför i en `AND`-array. Utan det hade personfiltret tyst försvunnit och
  varenda säljare sett allas personliga manus.
- **`assignedToId: { in: [null, user.id] }` fungerar inte.** `IN` matchar aldrig
  NULL i SQL, så varje allmänt manus hade fallit bort — alltså motsatt fel, och
  det syns direkt. Det första hade inte synts alls.

### `valjNiva` ligger i script-resolver.ts

Nivåvalet är bruten ur `getActiveScripts` till en ren funktion, och det är inte
kosmetik: regeln avgör vad en säljare läser upp i ett skarpt samtal, och en tyst
bugg där betyder antingen att någon tappar sitt manus eller att en text skriven
åt en person möter hela golvet. Ingetdera syns förrän någon berättar det.

Åtta prov i `scripts/test-script-resolver.ts`, bland dem ett som slår fast att
funktionen skiljer **nivåer** och inte **personer** — så att nästa anropare inte
tror att den är behörighetskontrollen.

### Fällan i `on delete set null`

Kolumnen har `on delete set null`, som `listId`, och den bär samma fälla: NULL
betyder "gäller alla". Raderas en säljare skulle hans personliga manus alltså
möta hela golvet i samma sekund kontot försvann — precis det som hände med
kampanjmanus när en mapp raderades (026).

`deleteUser` arkiverar därför säljarens personliga manus **innan** kontot tas
bort, utanför transaktionen så att det är gjort före FK:n. Samma rad som
`deleteList` bär, av samma skäl. Raderingsrutan räknar dem också: en knapp som
tystar fyra manus ska säga det innan den gör det.

`duplicateTemplate` ärver säljaren. "Kopiera till bygg-mappen" på Annas manus
ger Annas manus i bygg-mappen — att tyst släppa kopian fri hade gett hela golvet
en text skriven åt en person, vilket är det enda utfallet som är omöjligt att
upptäcka innan någon läser upp det i ett samtal.

`sortOrder` räknas per **nivå** och inte per mapp: nivån är kön manuset står i,
eftersom två nivåer aldrig visas samtidigt.

### Det den inte gör

**Ingen notis till säljaren.** I dialern behövs ingen: manuset står på skärmen
i nästa samtal, till skillnad från ett dokument i ett intranät som ingen
öppnar av sig själv. Blir det ändå ett önskemål är det klockan (`Callback`)
som är kanalen, inte e-post.

**Ingen egen grupp i sidomenyn.** Personliga manus ligger kvar under sin mapp
med en märkning (`bara Anna`). En femte grupperingsnivå i en lista som redan
har två gjorde vyn svårare att läsa än vad märkningen kostar.

### Prov

`npx tsc --noEmit` rent. `scripts/test-script-resolver.ts` 24 godkända.
**`scripts/test-scheduler.ts` har fyra röda som fanns före den här ändringen**
— "vill ej prata med säljare" och "nej på pris" ger `NaN dagar`. Bekräftat med
`git stash`. De är orörda här och hör till en egen genomgång.

---

## 2026-09-10 (sist) — Admin kan sätta lösenord åt någon annan

Beställt: *"sätt så att admin kan ändra lösenord på alla användare"*.

Fram till nu fanns exakt två vägar till en lösenordshash: `createUser` när
kontot föddes, och `changeOwnPassword` under Inställningar. Den senare kräver
det **nuvarande** lösenordet, vilket är precis det den utelåsta säljaren inte
har. Enda utvägen för en glömd inloggning var alltså att radera kontot och
skapa ett nytt — och raderingen flyttar samtal, pass, affärer och återkomster
till gravstenskontot. Sex glömda tecken kostade en säljares hela historik.

**`setUserPassword(id, nyttLösenord)`** i `actions/users.ts` är vägen.
`requireAdmin`, minst 8 tecken, bcrypt med kostnad 12 — samma kostnad som de
två andra vägarna, så att hashar från olika håll inte går att skilja åt.
Gravstenskontot nekas explicit trots att det redan filtreras bort ur listan i
`/admin`: id:t kommer från klienten och en filtrerad vy är ingen behörighet.

**Admin byter inte sitt eget lösenord här.** `changeOwnPassword` frågar efter
det gamla för att en obevakad skärm inte ska räcka för att låsa ut kontots
ägare, och det skyddet vore borta i samma sekund som admin kunde skriva om sig
själv från adminvyn. Samma regel som `updateUserRole` redan har. Meddelandet
pekar på Inställningar i stället för att bara neka.

**Rutan visar lösenordet i klartext**, med en `Slumpa`-knapp som drar 14 tecken
ur ett alfabet utan `0/O` och `1/l/I`. Det här är inget lösenord någon skriver
in på sig själv — det ska läsas upp i telefon eller klistras in i ett chattfönster,
och ett prickat fält gör bara att det läses upp fel. Nyckelikonen sitter bredvid
papperskorgen på varje rad, och de två utfällda rutorna stänger varandra.

### Det den inte gör

**En redan inloggad session överlever bytet.** Sessionen är en JWT utan
spegling i databasen (`session: { strategy: "jwt" }`), så det finns ingen rad
att ogiltigförklara — hashen läses bara i `authorize`, alltså vid nästa
inloggning. Kvittensen i vyn säger det rakt ut. Ska ett kapat konto stängas
**nu** är raderingen fortfarande enda vägen.

Att laga det på riktigt kräver en `passwordChangedAt` på `User` och en
jämförelse i `jwt`-callbacken — men den callbacken körs vid varje anrop, och en
databasläsning där lägger en fråga på varje sidladdning för hela golvet. Inte
gjort, medvetet.

**Ingen `Activity` skrivs.** `Activity.leadId` är obligatorisk och kaskadraderas
med bolaget; ett lösenordsbyte hör inte till något lead. Vill man ha spår på
kontonivå behövs en egen tabell — loggen som finns är bolagens, inte
systemets.

### Öppna punkter

- [ ] **Ingen spårbarhet på lösenordsbyten.** Vem som satte vems lösenord, och
      när, står ingenstans. Kräver en tabell som inte hänger på `leadId`.
- [ ] **Ett byte loggar inte ut den som redan är inne.** Se ovan — kostnaden är
      en databasläsning per anrop i `jwt`-callbacken.

---

## 2026-09-05 — Kön som stod still, och rutan som inte kunde försöka igen

Beställt: *"det handlar inte bara om förfallna utan att det är något konstigt
med dialern att det inte ens går att lägga till en återkomst ibland"*.

Gårdagens två fixar (atomicitet + idempotens) var riktiga men täckte bara
cockpitens skrivkö. Två saker låg kvar, och båda drabbade **lovade** samtal.

### Bokningsrutan i klockan hade varken omförsök eller skydd mot utloggning

`CallbackDisposition` är enda vägen att disponera en återkomst — bolaget ligger
utanför däcket så länge löftet står öppet, så cockpiten kommer aldrig åt det.
Rutan gjorde ett ensamt `fetch` utan omförsök. Tre fel följde:

**Nyckeln genererades per försök, inte per ruta.** `crypto.randomUUID()` låg
inne i `commit`, så varje nytt tryck fick en ny idempotensnyckel. Precis det
migration 027 fanns för — att ett omförsök inte ska bli ett andra samtal —
gällde alltså inte här. Det är samma mönster som lämnade fem försök i rad på ett
bolag den 4 september.

**Ett serverfel var slutstation.** En transaktion som timade ut gav "Kunde inte
spara samtalet" och säljaren fick trycka om för hand. Kön fick omförsök igår;
den här vägen fick det inte.

**En utgången session räknades som en lyckad skrivning.** Utan
`redirect: "manual"` följer webbläsaren middlewares omdirigering till
inloggningen och får HTML tillbaka med **status 200**. `res.ok` blev sant,
`res.json()` fallerade tyst till `null`, ingen post såg misslyckad ut — och
rutan stängdes med `onDone()` som om löftet var infriat. Ingenting skrevs, och
raden såg ringd ut. `useDispositionQueue` har en egen kommentar om exakt den
fällan sedan länge; den här filen hade bara aldrig fått samma skydd.

Lagat: en nyckel per ruta, fyra försök med 0,4–3 s backoff, `redirect: "manual"`
plus kontroll av `content-type`, och besked om utloggning i stället för ett
falskt kvitto.

### Server actions delar en enda seriell kö — och pollningarna låg i den

Det här är svaret på "allt tar tid", och det är inte samma sak som gårdagens
långsamhet.

App Routers klient har **en** `actionQueue`. Ligger en åtgärd och väntar läggs
nästa sist och startar först när den föregående är klar
(`next/dist/shared/lib/router/action-queue.js`). Kön är gemensam för alla server
actions på sidan.

I cockpiten stod alltså bakgrundens pollningar i samma kö som säljarens egna
åtgärder:

| Åtgärd | Intervall |
|---|---|
| `heartbeat` | var 15:e sekund |
| `listCallbacks` × 2 klockor | var 60:e sekund |
| `renewLeases` | var 5:e minut + varje `visibilitychange` |

Bakom dem: `saveCockpitNote`, `createDeal`, `leaseSpecificLead` (⌘K och
klockan) och påfyllningen av däcket. Turso går kall mellan anropen och läser
~3 400 rader/s kall, så en pollning som landar kallt tar sekunder till tiotals
sekunder — och under hela den tiden händer **ingenting** när säljaren trycker.
Det är den frusna känslan, och den är intermittent av exakt samma skäl som
kylan är det.

Att dispositionerna redan låg i en route handler är därför också förklaringen
till att just de fortsatte fungera medan resten kändes dött.

Flyttade till route handlers: `/api/presence`, `/api/callbacks`, `/api/leases`.

**Rättelse mot en hypotes som såg riktig ut.** Första förklaringen var att varje
server action renderar om sidan — på `force-dynamic` alltså hela `leaseNextLeads`
en gång i minuten. Den är **fel**. Next hoppar över flight-renderingen när
åtgärden inte revaliderat en sökväg (`skipFlight` i `action-handler.js`), och
ingen av pollningarna gör det. Kostnaden är kön, inte renderingen. Skillnaden
spelar roll för nästa gång någon letar: leta efter vad som står i kö, inte efter
vad som renderas om.

### Tidsbudget i dispositionskön

`/api/dispositions` skrev upp till 50 poster sekventiellt inom `maxDuration`
30 s. En kö som vuxit under ett avbrott hann aldrig klart, hela anropet dödades
mitt i, nästa försök började om på samma 50 — och efter sex varv gav kön upp med
"kunde inte sparas" om samtal som gick alldeles utmärkt att skriva, bara inte
alla på en gång.

Rutten har nu en budget på 20 s och svarar med `unprocessed` för det den inte
hann börja på. Kön lägger tillbaka dem **utan** att räkna ett försök och tömmer
vidare direkt. Blocket är sänkt från 50 till 10. Minst en post per anrop alltid,
så kön garanterat går framåt.

### Mätt i produktionen före ändringen

Gårdagens fix bekräftad: bokade återkomster mot faktiska `Callback`-rader
stämmer exakt varje dag 25 augusti–3 september (35/35, 36/36, 31/31, 49/49,
61/61, 50/50, 67/67, 56/56). Bara den 4 september skiljer: **61 bokade, 51
sparade**. Alla tio låg mellan 14 och 16, åtta av dem inom timmen 15–16.

`sqlite_stat1` har 113 rader — `ANALYZE` från igår ligger kvar.

**Förfallna återkomster har tredubblats**: 51 vid nollmätningen 20 augusti,
**160 idag** av 288 öppna. Cockpit-klockan räckte alltså inte. Se `ATT_GORA.md`
punkt 3 — frågan den lämnade öppen är besvarad, och svaret är nej.

Fixen är **oprövad i skarp drift**: den deployades en lördag och varenda
`CallAttempt` har fortfarande `idempotencyKey = NULL`. Måndag 7 september är
första riktiga provet.

---

## 2026-09-04 — Dialern "bara laddade": planeraren hade ingen statistik

Beställt: *"när jag går in på dialern så stannar det helt och allt som händer är
att den laddar"*.

Ingenting var trasigt. Appen var för långsam, funktionerna hann inte klart, och
`loading.tsx`-skelettet är det man ser när RSC-strömmen aldrig stängs. Flera
rutter svarade **503** när sidomenyns länkar förhämtades samtidigt.

**Två ändringar, båda i databasen. Ingen kod, ingen deploy.**

| | före | efter |
|---|---|---|
| `/cockpit` | 37–44 s | 774 ms – 2,1 s |
| `/lists` | 12–13 s | 404 ms – 2,6 s |
| Däckfrågan i `leaseNextLeads` | 10 181 ms | 737 ms |

### `ANALYZE` hade aldrig körts

Det fanns ingen `sqlite_stat1` i databasen. Utan statistik gissar SQLites
planerare på selektivitet, och den gissade fel på precis den fråga som betyder
mest: däcket drevs på `Lead_retired_nextActionAt_idx (retired = ?)` — ett
villkor som matchar **17 560 av 18 067** rader. Alltså vandrade den varenda
icke-pensionerad lead, körde tre till fyra korrelerade underfrågor per rad,
sorterade allt i ett temp-B-träd och tog sedan 20. Mappfiltret, det enda som
verkligen skär, applicerades per rad i stället för att driva frågan.

Bevisat före åtgärd genom att tvinga fram omvänd join-ordning på identisk fråga:
`Lead` först 10 181 ms, `LeadOnList` först **728 ms**. Efter `ANALYZE` väljer
planeraren den snabba vägen av sig själv, för både SELECT:en och UPDATE:en.

**En full `ANALYZE` går inte igenom över Tursos HTTP.** Den timade ut efter fem
minuter och rullades tillbaka. Kör per tabell i stället — `ANALYZE "LeadOnList"`
tog 236 s ensam, `Lead` 92 s. Resultatet blev ändå fullständigt: 113 rader som
täcker hela databasen.

Statistiken blir inaktuell när beståndet växer. **Kör om den efter varje större
import**, annars kryper felvalet tillbaka.

### `leaseBlockSize` 25 → 8

Cockpiten hämtade **25 leads komplett** — kontakter, historik, anteckningar,
växelkontakt, dossier och alla claims — för att kunna ringa ett samtal.
Payloaden gick från 179 KB till 61 KB.

### Det som är golvet under alltihop

Turso läser ungefär **3 400 rader per sekund** vid kall cache. Mätt:
`count(*)` på `LeadClaim` (77 676 rader) tog **22 976 ms**, medan en ren rundtur
är 88 ms och en skrivning ~80 ms. Lokal SQLite gör miljoner rader per sekund —
skillnaden är att varje sida som inte ligger i cachen hämtas över nätet.
Instansen går kall mellan anropen, så första träffen efter en tyst stund betalar
hela priset igen. Det är därför felet var intermittent.

### Fallgropar under felsökningen

**Mät TTFB och strömmens slut var för sig.** `await fetch()` följt av
`await r.text()` mätt som en siffra döljer vad som händer: TTFB var 140 ms hela
tiden — servern svarar direkt med skalet — och det var sidans data som höll
strömmen öppen i 40 s.

**Den första mätningen efter en ändring ljuger.** Både `ANALYZE` och
konfigändringen såg ut att inte hjälpa alls, för att första varvet var kallt.
Kör tre varv.

**`vercel logs` visar inte allt.** Rutter som tog 40 s dök aldrig upp i
strömmen, och `/v3/deployments/.../events` gav en tom lista. Nätverksfliken i
webbläsaren och direkta mätningar mot databasen var det som gav svar.

### Samma dag: säljarna kunde inte lägga återkomster

Symtomet var ett felmeddelande, inte en långsam sida — och det var **inte
nätverket** (0 % paketförlust, 11 ms till Vercel, svar på 0,27–0,49 s).

`recordAttempt` skrev samtalet **ensamt**, före transaktionen:

    const attempt = await db.callAttempt.create({…})   // egen skrivning
    const writes = [ lead.update(…), callback.create(…), … ]
    await db.$transaction(writes)                      // faller den, står samtalet kvar

Föll transaktionen var samtalet redan bokfört, men återkomsten, arbetslåset och
schemaläggningen fanns inte. `useDispositionQueue` lägger tillbaka poster som
fallit på **nätverksfel** men **kastar** dem som fallit på serverfel, så löftet
försvann tyst medan säljaren fick remsan "kunde inte sparas" — och varje nytt
tryck skrev ännu ett föräldralöst samtal.

Mätt i produktionen: 59 samtal med `CALLBACK_BOOKED` den 4 september, men bara
49 `Callback`-rader. Ett bolag samlade fem försök in i rad mellan 15:23 och
15:25 medan säljaren tryckte om.

**Lagat** genom att förgenerera `CallAttempt.id` med `randomUUID()` och flytta
in skrivningen i samma `$transaction` som allt den hör ihop med. Prismas
array-form kan inte referera ett id som skapas i samma batch — därför det egna
id:t. Ordningen i arrayen spelar roll: `CallFrameworkProgress.callAttemptId` är
en riktig FK, så samtalet måste ligga först.

**Buggen är gammal** — 4 föräldralösa den 12 augusti, 2 den 6 augusti. Men 9 av
dagens 10 låg mellan 14:45 och 15:25, alltså mitt i felsökningen ovan: `ANALYZE`
och de kalla count-frågorna belastade databasen medan golvet dispositionerade.
**Kör tunga frågor mot den här databasen utanför säljtid.**

Två löften gick inte att rädda — S&M ELSERVICE AB och Morgan Bäck Bygg &
Entreprenad AB. Tidpunkten kunden fick lovad fanns bara i transaktionen som
föll, och båda leaden saknade dessutom `claimedAt` och låg alltså oskyddade i
hela golvets däck.

### Och sedan: kön vågar försöka igen (migration 027)

Atomiciteten stoppade halvskrivningarna, men kön **kastade** fortfarande varje
post som fallit på serverfel — den lade bara tillbaka nätverksfel. Skillnaden
var medveten och fel: ett serverfel kunde lika gärna vara en transaktion som
timade ut under belastning, alltså precis det som går att försöka igen.

Skälet till att den inte gjorde det var att skrivningen inte var idempotent. Ett
omförsök hade skrivit ett andra samtal på bolaget, med nytt löpnummer, och
dubblat raden i statistikens nämnare. Att kasta posten var det mindre onda.

**`CallAttempt.idempotencyKey`**, nullbar och unik, bredvid `providerCallId` som
är samma sorts nyckel för telefoni-webhooks. `recordAttempt` slår upp den före
allt annat och returnerar `{ alreadyRecorded: true }` i stället för att skriva
igen; det unika indexet fångar två anrop som korsar varandra (P2002 på just den
kolumnen tolkas som "redan gjort", andra unikhetskrockar kastas vidare).

Kolumnen är nullbar med flit — 5 844 befintliga rader har NULL, och **SQLites
unika index tillåter flera NULL**. En backfill till tom sträng hade tvärtom
kolliderat direkt.

Rutten svarar nu `{ key, ok, error, retryable }`. `isRetryable` har **ja som
förval**: ett onödigt omförsök kostar ett uppslag, ett uteblivet kostar ett
samtal. Permanenta undantag är `ForbiddenError`, våra egna valideringskast
("Lead not found", "Ogiltig tidpunkt", "Välj varför kunden sa nej",
"DialerConfig saknas") och Prismas deterministiska P2002/P2003/P2025.

Kön räknar försök per nyckel, ger upp efter sex och backar av 1→2→4→8→16→30
sekunder. **Nätverksfel räknas inte mot taket** — ett serverfel kan vara
felklassat och måste ha ett stopp, men ett tappat wifi är per definition
övergående. Backoffen hoppas över vid `pagehide`: där är det sista chansen.

**Nyckeln är `crypto.randomUUID()` per tryck.** Idempotensen skyddar alltså
köns egna omförsök av samma tryck — inte en säljare som trycker om för hand
efter att ha sett remsan. Det är avsiktligt: två tryck är två beslut.

### Öppna punkter

- [ ] **`noPhoneFound` skickas aldrig om.** Den raderar leadet och har ingen
      idempotensnyckel att luta sig mot — ett omförsök efter en halvvägs lyckad
      körning hade antingen kastat `Forbidden` (leadet är borta) eller lagt en
      andra rad i den oföränderliga aktivitetsloggen. Den visar remsan direkt
      vid fel, som förut.
- [ ] **Kallstarten kvarstår.** Första sidladdningen efter en tyst stund tar
      fortfarande tiotals sekunder. Det är en Turso-plansfråga, inte en
      kodfråga — gratisnivåns cache är för liten för 18 000 leads och
      77 676 claims.
- [ ] **`hydrateLeads` hämtar `dossier.claims` för hela blocket.** `LeadClaim`
      är största tabellen (77 676 rader) och den dyraste läsningen. Claims
      behövs bara för det lead säljaren står på — men `resolveScript` tar dem
      som argument, så manusupplösningen måste flyttas till samma lata laddning.
      Vald åtgärd, uppskjuten: ombyggnaden rör själva ringflödet och gjordes
      inte mitt i ett säljpass.
- [ ] **`take` på nästlade relationer ger en fråga per lead.** `callAttempts`,
      `activities` och `gatekeepers` blir tre extra rundturer per lead i
      `hydrateLeads`.
- [ ] **`leaseBlockSize = 8` är satt utan mätning av rätt värde.** 25 var för
      mycket, 8 fungerar. Om säljarna märker att kön tar slut mellan samtal är
      det siffran att skruva på.

---

## 2026-09-03 — Manuset var byggt för en struktur ingen använde

Beställt: *"När jag trycker på 'nytt utkast' så hoppar den mellan olika manusar.
Sen måste jag också kunna ta bort manus, det finns ingen ta bort knapp. Sen är
strukturen konstigt, vissa står inaktiva … och sen får de flera manusar på en
ringlista."*

Fyra fel, och de hängde ihop.

**Hoppet.** Varje mutation i manusvyn slutade med `window.location.reload()`.
Efter omladdningen initierades markeringen till `templates[0]?.id` — alltid
*första* manuset i listan, aldrig det man arbetade i. "Skapa", "Publicera",
"Nytt utkast" och byte av mapp hoppade därför alla till fel manus. Markeringen
ligger nu i `?manus=<id>` och mutationerna kör `router.refresh()`, som hämtar ny
serverdata utan att kasta klientens tillstånd. **Lägg aldrig tillbaka en
`window.location.reload()` i en vy som har en markering.**

**Ta bort-knappen fanns inte, och inte heller av/på.** `deleteTemplate` och
`setTemplateActive` låg i `actions/scripts.ts` men anropades inte från någon
komponent — död kod sedan de skrevs. Enda vägen in i `active = false` var
`deleteList`, och det fanns ingen väg ut. Tre manus i produktion låg avstängda
utan att någon kunde slå på dem.

**De inaktiva var föräldralösa.** `deleteList` stänger av mappens manus innan
mappen raderas, och FK:n nollar `listId`. Mapparna importerades sedan om under
samma namn men med **nya id:n**, så manusen blev kvar med ett namn som pekade på
en mapp som formellt inte fanns. `deleteList` arkiverar dem numera i stället, så
de hamnar i arkivsektionen och går att läsa och ta fram.

**Dubbletten på ringlistan var den verkliga strukturkrocken.** Verktyget är
byggt för *ett stycke per ramverkssteg*; i praktiken skrivs *ett helt manus per
kampanj*, som klistras in i en enda variant och hamnar under ett godtyckligt
steg. Alla fyra manus i databasen började med "1. INTRO — Hej, du pratar med
Adam", inklusive det som låg under steget `ROI`. Mappregeln matchade på steg, så
en säljare i `hantverkare_5000_alla` fick mappens ROI-manus **och** det allmänna
INTRO-manuset: samma text två gånger, under två rubriker.

**Regeln är nu per mapp, inte per steg:** har mappen egna manus gäller bara de,
annars gäller de allmänna. En mapp som bara vill ändra öppningen kopierar det
allmänna manuset hit (`duplicateTemplate`) och redigerar kopian — ett steg mer
att skriva, och till skillnad från steg-matchningen går det att förklara.
`step` lever kvar som frivillig etikett men styr ingenting; cockpiten rubricerar
på `name` och sorterar på `sortOrder`.

**Cockpiten.** Första manuset låg permanent uppslaget utan knapp — det stämmer i
sekund ett och slutar stämma i sekund trettio, och när ett helt manus ligger i
det blocket är det en textvägg. Allt är fällbart nu. Öppet/stängt sparas i
`localStorage` per templateId, eftersom `CockpitDb` monterar om panelen vid varje
leadbyte (`key={lead.id + contactIndex}`, animationen) — ett `useState` där
nollställdes 150 gånger om dagen. Listan nycklades dessutom på `step`, vilket ger
dubblettnycklar och öppnar två manus samtidigt när en mapp har två.

**Migration 026** lade `archived` och `sortOrder`, och städade de fem manusen:

| Manus | Åtgärd | Varför |
|---|---|---|
| Växel (3 409 samtal) | arkiverat | Innehåller ett komplett manus för **PRP-behandling mot håravfall** — en avslutad kampanj, inget växelmanus. Låg redan avstängt |
| Intro — leads_bygg_hantverk (402) | arkiverat | Äldre dubblett av nästa rad |
| Intro — leads_bygg_hantverk (351) | döpt om till **Allmänt manus** | Hette efter en mapp men hade `listId NULL` och gick ut överallt. Fick medvetet förbli allmänt: knöts det till mappen (599 leads) hade Clicknet Lista 1, Utan hemsida lead, sokning_Clicknet2 och Nya bolag stått helt utan manus |
| Intro — clicknet_leads_bokadirekt_import (0) | kopplat till mappens nya id, påslaget | Föräldralöst sedan mappen raderades och importerades om |
| ROI — hantverkare_5000_alla (1 222) | döpt om till **Manus — hantverkare_5000_alla** | Namnet är rubriken säljaren ser nu, och "ROI" ljög om innehållet |

Utfallet: varje mapp får exakt ett manus, ingen får två, ingen står utan.

**Öppen punkt:** varje manus har exakt **en** variant. Hela varianthanteringen —
prioritetsordning, datakrav, `minConfidence`, `lintVariants` — har aldrig
använts skarpt. Den är inte trasig, men den kostar plats i redigeraren och i
huvudet på den som ska skriva ett manus. Fråga innan nästa manusarbete om den
ska bort eller om den ska säljas in.

---

## 2026-09-01 — Affären är säljarens att skapa, inte att skriva om

Beställt: *"jag måste kunna gå in och ta bort affärer och ändra osv, dock ska
inte säljare kunna göra det men jag ska kunna."*

Fram till nu låg `updateDeal` och `cancelDeal` bakom `requireDealAccess` — samma
grind som läsningen. Vem som helst som såg affären kunde alltså skriva om
ordervärdet på den, inklusive säljaren som tjänade provision på siffran, och
ångra den utan att någon annan visste om det. Det är inte ett underlag.

**Ny gräns:** `createDeal` är kvar hos säljaren — affären föds i dispositionen
och ska göra det. Allt som händer *efter* avslutet är admin:
`requireDealAdmin` i `src/lib/guard.ts` bär `updateDeal`, `cancelDeal` och den
nya `deleteDeal`.

**Ångra ≠ radera, och de ligger inte bredvid varandra som jämbördiga val.**

| | Vad | Raden | När |
|---|---|---|---|
| `cancelDeal` | utfall | står kvar som LOST | kunden hoppade av |
| `deleteDeal` | rättelse | borta | feltryck, dubblett, fel bolag |

En ångrad affär är information för den som räknar stängningsgrad. En affär som
aldrig skulle ha funnits är brus i samma siffra. Det fanns tidigare bara det
första, och därför fanns det ingen väg alls att bli av med ett feltryck.

**Loggen rensas inte.** `deleteDeal` skriver en `DEAL_DELETED`-aktivitet med
titel, belopp, status och vem som sålde den bevarade i metadata *innan* raden
raderas, och de gamla `DEAL_WON`-raderna står kvar. En affär som gick att radera
spårlöst hade gjort aktivitetsloggen värdelös som underlag — och tre personer
har ADMIN i produktionen (Harris, Simon, Zen), så "admin" är inte samma sak som
"jag". Loggen svarar på vem.

`DEAL_DELETED` är ett nytt värde i `ActivityType`. `Activity.type` är TEXT i
SQLite utan CHECK-villkor, så det krävde **ingen migration** — bara en ny
genererad klient, vilket Vercels `postinstall` gör av sig själv.

`hasActiveDeal` räknas om efter raderingen på samma villkor som i `cancelDeal`:
bolaget går tillbaka i rotationen först när ingen vunnen affär håller det kvar.

I gränssnittet: `/deals/[id]` får `isAdmin` från sessionen. Säljaren ser hela
sidan men får en låsikon där Redigera stod — en knapp som saknas utan
förklaring läses som en bugg och genererar en fråga. Raderingen bekräftas i
sidan, inte i en `window.confirm`: en systemruta klickas bort, den läses inte,
och det här är enda åtgärden på sidan som inte går att ta tillbaka.

**Öppen punkt:** `updateLead`, `deleteContact` och anteckningar är fortfarande
öppna för säljare. Det här arbetet gällde affärer. Om samma resonemang ska
gälla kunduppgifter är det ett eget beslut.

---

## 2026-09-01 — Ett obesvarat samtal räknades som ett infriat löfte

Rapporterat från golvet: *"en säljare har tryckt in 'ring igen' och sen har en
annan säljare fått upp det fast det inte är hans kund. När jag letar på
återkomster 'golvets återkomster' hittar jag inte heller kunden där."*

Båda halvorna stämde, och de var **två separata fel** som råkade ge samma bild.

### 1. Löftet stängdes av att telefonen ringde, inte av att någon svarade

`recordAttempt` stängde säljarens egna förfallna återkomster på varje samtal,
med motiveringen *"tiden var inne och jag ringde — det är exakt vad raden bad
om."* Men **ringde är inte nådde fram.** Ett `NO_ANSWER` på en förfallen
återkomst markerade löftet som COMPLETED, och därifrån föll bolaget ut i golvet
i tre steg som alla utlöstes av samma skrivning:

- Raden blev COMPLETED och försvann ur klockan — och ur chefsvyn. Löftesgivaren
  hade inget kvar som påminde om att ringa igen.
- `claimsLead(null)` är falsk, så `claimedAt` nollades i samma `lead.update`.
  Låset som fanns för att skydda just det personliga löftet försvann med det.
- Däckets `NOT EXISTS (… status='PENDING')` släppte bolaget fritt, och
  `nextActionAt` sattes till `retryHoursNoAnswer` — **20 timmar**.

Nettot: en kund som bett en namngiven säljare ringa tillbaka låg dagen efter i
hela golvets däck, utan lås, utan löfte och utan spår någonstans.

Det lömska är att felet **bara triggas av misslyckade samtal**. Ringde säljaren
och fick svar stängdes löftet korrekt. Ringde hen och ingen svarade — det
vanligaste utfallet i hela systemet — förlorades bolaget. Buggen bet alltså
hårdast på de löften som krävde flest försök.

### Mätt i produktionsdatan

| | |
|---|---|
| Stängda återkomster totalt | 196 |
| — varav stängda av ett samtal **där ingen svarade** | **36** |
| — varav `NO_ANSWER` | 35 |
| — varav växeln kopplade vidare (korrekt stängd) | 1 |
| Alla 36 med `claimedAt = NULL` efteråt | ja |
| Alla 36 med `nextActionAt` ~ett dygn senare | ja |

Fördelningen av hur de 196 stängdes säger var hålet satt: `CONNECTED_DM` 152
(korrekt), `WRONG_NUMBER`/`BORTFALL` 8 (terminalt, korrekt), **`NO_ANSWER` 35**.

Kontrollerat samtidigt, och rent: **0 återkomster stängda av fel säljare** (det
var buggen 13 augusti, och migration 016 håller), **0 leads utlånade till någon
annan än löftesgivaren medan löftet var öppet**, och **0 samtal där leadets
uppdatering uteblivit** — transaktionen i `recordAttempt` har aldrig fallit
halvvägs. Skyddet fungerar så länge löftet finns. Felet var att löftet
försvann.

### Lösningen: löftet flyttas fram, det stängs inte

Ny regel 4 i återkomstavsnittet: svarade ingen (`!isConnected(result)`), bokades
ingen ny tid och pensionerades inte leadet, så **flyttas** raden fram till
leadets `nextActionAt` i stället för att stängas. Samma tidpunkt som bolaget
ändå skulle ringts — men raden förblir PENDING, bunden till den som lovade, och
bolaget ligger kvar utanför däcket. `emailSentAt` och `seenAt` nollas, samma
nollställning som `rescheduleCallback` gör: ny tid, ny påminnelse.

Ett löfte lämnar alltså fortfarande klockan på exakt två sätt — det ringdes
**och någon svarade**, eller det avbokades. En signal i luren är ingen av dem.

Låset fick samma behandling åt andra hållet. `claimsLead` ser bara utfallet och
kan inte veta att en återkomst står kvar, så efterspelet i `recordAttempt` — det
som redan läste kvarvarande PENDING-rader för att skriva om `callbackAt` —
skriver nu också tillbaka `claimedAt` och `ownerId` till **löftesgivaren**.
Strängt taget behövs det inte för att skydda bolaget (däckets filter gör redan
det), men utan det ser bolaget oägt ut i mappvyn, på lead-sidan och i varningen
från `leaseSpecificLead`. Invarianten "öppet löfte ⇒ låst till löftesgivaren"
ska gälla i datan, inte bara i koden.

### 2. Chefsvyn kunde inte visa det den frågades om

`listCallbacks` hade `scheduledAt <= nu + 7 dagar`. Kommentaren sa *"bara ett
tak, inget golv"* — golvet hade tagits bort en gång just för att det lät löften
försvinna av sig självt. **Taket gjorde exakt samma sak, åt andra hållet**, och
chefsvyn "golvets återkomster" delar frågan med klockan: **50 av 251 öppna
återkomster gick inte att se någonstans i systemet.**

En chef som söker efter ett bolag i den vyn och inte hittar det drar slutsatsen
att löftet inte finns. Det var precis vad som rapporterades — och i det här
fallet råkade det vara sant av den *andra* anledningen, vilket är varför de två
felen såg ut som ett.

Taket ligger nu i vyerna där det hör hemma: cockpitklockan filtrerade redan
lokalt på "dags inom fem minuter" och påverkas inte alls, sidomenyns räknare
räknar bara missade och aktuella, så en längre "Kommande"-lista gör den inte
högljuddare. `MAX_ROWS` höjt 200 → 500: med taket borta hade 200 blivit en tyst
avhuggning av `ORDER BY scheduledAt ASC`, alltså av precis de löften taket redan
dolde.

### Läkning av datan

`024_lakning_obesvarade_aterkomster.sql` öppnade **33 av de 36** igen, på den
tid dispositionen redan räknat fram (`Lead.nextActionAt`) — exakt vad den
rättade koden hade skrivit. 31 av dem är förfallna och ligger nu överst i
klockan hos sin säljare, vilket är rätt: löftet är försenat, inte borta.
`ownerId` och `claimedAt` gick tillbaka till löftesgivaren.

Tre lämnades med flit: två har ett **nyare samtal** bakom sig (att öppna ett
löfte bakom ett senare samtal vore att skriva om historien) och ett ligger på
ett **pensionerat** bolag.

Efteråt: `Lead.callbackAt` ↔ öppen `Callback` stämmer i **båda** riktningarna,
0 avvikelser, och alla tidsstämplar bär fortfarande formatet på 29 tecken.

### Öppna punkter

- **23 öppna löften saknar lås** (`claimedAt IS NULL`). Alla från 12–18 augusti,
  de flesta lovade av en sedan dess borttagen användare. De är skyddade av
  däckets återkomstfilter men syns inte som någons bolag i mappvyn. Gammal
  skuld, inte ny — den nya koden skriver tillbaka låset vid nästa disposition.
- ~~**En avbruten bokningsruta lämnar inget spår.**~~ Täppt samma dag, se
  nedan.
- **Vlado avbokade 37 egna förfallna återkomster på fem minuter** i morse. Helt
  legitimt, men värt att veta: en avbokning släpper bolaget till hela golvet
  direkt (minus vilan). Det är avsiktligt.

### Efterspel samma dag — den tysta vägen ur bokningsrutan

Trycket på `2 Ring igen` skriver ingenting. Först `Spara` gör det, och
däremellan fanns **tre helt tysta vägar ut**: backsteg, Escape och ⌘K. Alla tre
lämnade bolaget utan samtal, utan löfte och utan lås — kvar i hela golvets däck
— medan säljaren gick vidare i tron att en återkomst var bokad.

Symptomet är oskiljbart från felet ovan. Skillnaden är att det här inte lämnar
någon rad att hitta i efterhand: det finns per definition ingenting att räkna,
vilket också är varför det aldrig dykt upp i en mätning.

Beslutat efter avstämning: **varna, stoppa inte.** `UnsavedCallbackGuard` frågar
innan bokningen kastas och säger vad som går förlorat — "Imorgon 09:00 sparas
inte, och bolaget går tillbaka i kön för hela golvet". Fokus ligger på
`Tillbaka till bokningen`, inte på `Kasta`: säljaren trycker Enter hundra gånger
om dagen, och en reflex ska aldrig kunna kasta ett löfte. Samma princip som
`Bortfall` sist bland resultatknapparna — det oåterkalleliga hålls undan från
fingrarna, inte bakom en extra fråga.

Fyra vägar täppta, var och en där den faktiskt går:

| Väg | Hur |
|---|---|
| Backsteg och Escape | `goBack` → `guardLeave(stepBack)` — täcker varje anropsplats i stället för att lappa dem en och en |
| ⌘K och sökknapparna | `guardLeave(() => setShowSwitcher(true))` — uppslagningen passerar det pågående bolaget via `passLead` |
| Notisklockan | Returnerar ett felmeddelande på raden i stället för att öppna en andra ruta. Klockan visar det redan; två frågor ovanpå varandra — en om bolaget man lämnar, en om det man är på väg till — är värre än ingen |
| Omladdning och stängd flik | `beforeunload`, monterad **bara** medan rutan står öppen. En som ligger kvar hela passet gör varje sidbyte till en fråga och lär säljaren att klicka bort den |

`passLead` och `prevLead` lämnades omedvetet oskyddade och är det med flit:
knapparna och tangenterna för dem renderas bara i resultatsteget, alltså aldrig
medan bokningsrutan står öppen. Att guarda dem inifrån hade dessutom brutit
`openLeadById`, som anropar `passLead` **efter** att det nya bolaget redan
reserverats — bekräftelserutan hade då dykt upp mitt i en halvfärdig växling.

### Efterspel 2 — `Avboka` var samma hål med en annan knapp

Beställt direkt efter: *"när en återkomst släpps så lägg ett krav att man måste
lägga ett utfall, så ifall det var nej tack osv."*

Rätt sett, och det var inte en förbättring utan en tredje variant av samma fel.
`Avboka` gjorde två saker: satte raden till CANCELLED och lät
`syncLeadFromCallbacks` lägga tillbaka bolaget på den vila det redan tjänat
ihop. På ett bolag där någon bokat en återkomst är senaste resultatet
`CONNECTED_DM`, och den saknar gren i `retryHours()` — alltså `default:`,
`retryHoursNoAnswer`, **20 timmar**.

Sa kunden "nej tack, sluta ringa" när säljaren följde upp löftet, och säljaren
avbokade i stället för att registrera samtalet, låg bolaget tillbaka i hela
golvets däck dagen efter. Samma slutresultat som felet ovan, samma 20 timmar,
men via en knapp som såg ut som en städknapp. **Beskedet från kunden fanns i
huvudet på en säljare och ingenstans i datan.**

En avbokning är ett beslut om bolaget, inte en städning av en lista. Knappen
heter nu `Släpp` och kräver ett skäl, och skälet skriver samma tillstånd på
leadet som motsvarande utfall i dispositionen ger:

| Skäl | Leadet |
|---|---|
| `SA_NEJ` (+ en av de åtta anledningarna) | Vilar 60 dagar, `lastOutcome = DM_NO` |
| `BORTFALL` | Pensionerat **och** spärrlistat på org-numret |
| `FEL_NUMMER` | Pensionerat, som `WRONG_NUMBER` |
| `FELBOKAD` | Tillbaka i rotationen — det gamla beteendet |

Fyra val, inte tio: panelen öppnas mitt i ett pass och varje extra rad är en rad
som inte läses. `Sa nej` frågar i ett andra steg efter anledningen, med samma
åtta ord som cockpiten — ett förvalt "Inget behov" hade blivit det vanligaste
nejet i statistiken utan att någon valt det.

**`FELBOKAD` måste finnas.** Ett skäl som betyder "inget besked om bolaget" är
inte en lucka i kravet, det är förutsättningen för att kravet ska ge sann data:
utan en ärlig utväg väljer säljaren ett falskt skäl för att komma vidare, och då
ser datan fullständig ut och är fel. En obligatorisk fråga utan en sann
svarsmöjlighet är värre än ingen fråga.

**Ingen `CallAttempt` skrivs.** Med flit: den tabellen är statistikens nämnare,
och en avbokning som blev ett samtal hade sänkt svarsfrekvensen, höjt dagsmålet
och räknats i coachningen för ett samtal som aldrig ringdes. Samma skäl som
"Inget telefonnummer" ligger utanför `CallResult`. Spåret för en människa
skrivs i `Activity` i stället, med samma `{ status, notes }`-form som
CALL-raderna redan har, så att lead-sidan renderar den utan att veta att den
finns.

Två saker föll ut på vägen:

- **`blockLead` flyttades till `src/lib/donotcall.ts`.** `callbacks.ts` behövde
  den, och en `"use server"`-fil exporterar bara async-funktioner där **varje**
  export blir en endpoint klienten kan anropa. `blockLead` tar `userId` som
  parameter — en exporterad variant hade låtit vem som helst spärra vilket
  bolag som helst i någon annans namn.
- **`noRestDays` exporterades ur scheduler.ts.** Ett nej som kom fram när ett
  löfte släpptes ska vila lika länge som ett nej i cockpiten, och två
  uträkningar av samma tal blir förr eller senare två olika tal.

Fällan jag gick i själv under skrivningen, värd att skriva ner: den första
versionen lämnade `nextActionAt = null` om `DialerConfig` saknades. Det är
precis felet från 26 augusti — NULL betyder "aldrig ringt", inte "vilar", och
`ORDER BY nextActionAt ASC` sorterar NULL först. Ett nej hade landat allra
överst i hela golvets däck. Grenen faller nu tillbaka på
`syncLeadFromCallbacks` i stället, som räknar en riktig tid.

De 124 rader som avbokades före kravet får `cancelReason = NULL` och leadsen
bakom dem rörs inte. Skälet går inte att gissa i efterhand, och ett påhittat
`FELBOKAD` hade sett ut som om någon svarat på frågan.

### Låsningen ändras inte

Frågan ställdes om "de kan inte få upp andras utfall alls" skulle betyda att
fler utfall låser bolaget. Svaret blev **nej**: `claimsLead` fortsätter täcka
bara `CALLBACK_BOOKED` och `SOLD`. Ett nej vilar redan 60 dagar och ett
obesvarat samtal är ingen relation. Att låsa på varje samtal var precis det som
gällde före 13 augusti — 590 låsta leads varav 45 hade ett skäl — och det tar
slut på databasen långt innan det tar slut på krockar.

---

## 2026-08-28 — Bortfall: spärrlistan får äntligen en skrivväg

Beställt direkt efter nej-buggen: *"jag vill ha ett utfall som heter bortfall
då spärras kunden helt, och gör 'inget nummer' samma sak som bortfall."*

### Spärrlistan var ett filter utan åtgärd

`DoNotCall` fanns i schemat sedan starten och lästes av däckets WHERE-sats.
**Ingen kod skrev någonsin till den** — 0 rader i produktionen. Det gick alltså
att spärra ett bolag i teorin och inte i praktiken.

Det enda sättet att ta ett bolag ur rotationen var att pensionera raden
(`Lead.retired`), och det skyddet **dör vid nästa omimport**: bolaget kommer
tillbaka som en ny rad med ett nytt id, utan minne av att någon bett oss sluta
ringa. Det är samma familj av fel som nej-buggen — bolaget dyker upp igen — men
med en annan mekanism.

### Bortfall ligger i CallResult, inte i ConversationOutcome

Doktrinen säger att `result` är vad som hände med samtalet och `outcome` vad som
hände i det, vilket pekar mot `ConversationOutcome`. Den lades ändå i
`CallResult`, tangent **6** i resultatsteget, av två skäl:

- **Ett tangenttryck.** I outcome-steget krävs `4` följt av `5`, och det går
  bara när beslutsfattaren svarade. Kravet att tas bort ur registret kommer
  lika ofta från växeln, och kunden håller på att lägga på medan säljaren
  väljer.
- **Precedens.** `WRONG_NUMBER` och `INVALID_NUMBER` ligger redan i `CallResult`
  och är också beslut om *bolaget* snarare än om samtalet. `WRONG_NUMBER` bär
  till och med samma hint, "Spärrar leadet".

Priset är att svarsfrekvensen tappar en handfull samtal: `isConnected()` är
falsk för `BORTFALL`, trots att någon nästan alltid svarade. Billigare än att
låta ett bortfall se ut som en lyckad kontakt.

Knappen ligger **sist**, längst från fingrarna på 1–4. Den är oåterkallelig och
ska inte gå att råka trycka på vägen till "Nådde beslutsfattaren".

### Nyckeln är org-numret

`blockLead` skriver alla tre nycklarna, men de håller olika länge:

| Nyckel | Överlever radering | Överlever omimport | Finns alltid |
|---|---|---|---|
| `leadId` | nej — `onDelete: SetNull` | nej, nytt id | ja |
| `phoneE164` | ja | ja | **nej** |
| `orgNumber` | ja | **ja** — importen slår ihop på det | nästan alltid |

Däckets spärrfilter matchade fram till nu **bara `leadId`**. Det gjorde spärren
verkningslös i exakt det fall den behövs mest. Filtret matchar nu `leadId` ELLER
`orgNumber`, och samma andra led finns i `deckStatus`, i `leaseSpecificLead`s
varning, i mappvyn och på lead-sidan.

`phoneE164` blev nullbar (migration 023, tabellombyggnad — SQLite kan inte
släppa NOT NULL med ALTER). Ett nummerlöst bolag har per definition inget nummer
att nyckla på, och det är just det fallet som mest behöver överleva en import.
SQLite räknar NULL som skilda värden i ett unikt index, så flera nummerlösa
spärrar samexisterar.

**`BORTFALL` i enumet krävde ingen SQL.** Prisma lagrar enums i SQLite som ren
TEXT utan CHECK-villkor — verifierat mot `sqlite_master` innan migrationen
skrevs. Läggs ett CHECK till i framtiden måste värdet med.

### "Inget nummer" fortsätter radera

Uttryckligt val, mot rekommendationen: raderingen från 25 augusti står kvar, och
spärren skrivs **före** den. Efter raderingen finns inget lead att läsa
org-numret ur, och `onDelete: SetNull` nollar bara `leadId` — org-numret står
kvar i spärrlistan.

Nettoeffekten blir därmed ändå den som pekades ut som fördelen med att sluta
radera: bolaget är spärrat även efter en omimport, trots att raden det spärrades
på är borta. Skillnaden mot att pensionera är att bolaget inte syns i mappen —
vilket var hela poängen med beställningen den 25:e.

### Vägen tillbaka

`BORTFALL` är ett tangenttryck mitt i ett samtal och **kommer att tryckas fel**.
Att skriva en permanent spärr utan att bygga vägen tillbaka hade varit att
installera en dörr som bara går åt ena hållet.

- Lead-sidan har en röd banderoll högst upp när bolaget är spärrat, med skälet.
  Den saknades helt förut: ett spärrat bolag såg ut precis som vilket som helst,
  med "Öppna i dialer" en knapp bort — och `leaseSpecificLead` släpper in en.
- `liftDoNotCall` är **admin-bara** och syns bara för admin. Spärren finns för
  att skydda kunden från oss; att lyfta den är ett beslut om att börja ringa
  någon som bett oss låta bli, och ska inte ligga på den som råkade sätta den.
- Den lyfter både spärrlistan och pensioneringen — bara den ena hade lämnat
  bolaget stoppat ändå, på det andra villkoret, och gett ett gränssnitt som
  påstår att något hänt när ingenting hänt.
- Den rör **inte** `nextActionAt`. Ett bolag som sagt nej ska inte bli ringbart
  i förtid av att en spärr lyfts.
- Den lyfter inte `fel_nummer` eller `ogiltigt_nummer`. Numret är fortfarande
  fel.

### Öppen punkt

Det finns fortfarande **ingen admin-vy över spärrlistan** — man når en spärr
bara via bolaget den sitter på. Med 0 rader idag är det inget problem; blir det
hundratals behövs en lista att överblicka och söka i.

---

## 2026-08-28 (senare) — Ett nej vilade 20 timmar, inte 60 dagar

Rapporterat från golvet, och inte för första gången: *"ALLA säljare har fått
upp minst 8 kunder som någon annan har tryckt utfall att kunden har sagt nej,
men ändå får dem andra säljarna upp den igen och när vi ringer kunden blir
kunden skit sur och lägger på."*

Det stämde, och det var värre än åtta. **Rapporten underskattade felet med två
tiopotenser.**

### Felet

`computeNext` hade en gren för exakt **ett** nej: `VILL_EJ_PRATA_SALJARE`, med
30 dagars vila. De andra sju anledningarna — inget behov, har byrå, har
inhouse, nöjd med annan, pris, timing, nej innan pitch — hade ingen gren alls.
De föll igenom till normalfallet i steg 6, där vilan räknas ur `result`.

Resultatet på ett nej är `CONNECTED_DM`. Den saknar egen gren i `retryHours()`
och landar i `default:` — `retryHoursNoAnswer`, satt till **20 timmar** i
produktionen.

**Ett nej vilade alltså exakt lika länge som ett samtal där ingen svarade.**
Kunden tackade nej på tisdagen och låg tillbaka i hela golvets däck på
onsdagen. Inget claim-lås (`claimsLead` returnerar med rätta `false` för ett
nej — ett nej är ingen relation), ingen markering i däcket, ingenting som
skilde bolaget från ett obearbetat lead. Nästa säljare ringde.

Det lömska är att grenen som fungerade dolde att de andra saknades: koden såg
ut att hantera nej, och gjorde det — för en åttondel av dem.

### Mätt i produktionsdatan

| | |
|---|---|
| Registrerade nej totalt | 1 077 |
| Bolag vars senaste samtal var ett nej, **ringbara i samma sekund** | **636** |
| Ytterligare vilande och på väg tillbaka | 271 |
| Samtal ringda av en **annan** säljare efter ett nej | 66 |
| — varav inom ett dygn | **51** |
| Kortaste uppmätta vila efter ett nej | 20,0 h |
| Uppmätt vila för "vill ej prata säljare" | 740 h |

De 20,0 timmarna är inte ungefär `retryHoursNoAnswer` — de **är**
`retryHoursNoAnswer`, på decimalen. Fördelningen av de 636 visar var hålet
satt: INGET_BEHOV 545, TIMING 27, HAR_BYRA 23, NOJD_MED_ANNAN 20,
NEJ_INNAN_PITCH 10, HAR_INHOUSE 9, PRIS 1 — och **noll**
VILL_EJ_PRATA_SALJARE, eftersom det var det enda som redan vilade.

Per säljare, räknat på hur många av de ringbara nej-bolagen som fått sitt nej
av **någon annan**: Harris 635, Simon 635, Zen 632, Mick 631, Edvin 622,
Fredrik 517, Josef 494, Vlado 325. Golvet rapporterade åtta.

### Inte samma bugg som den 13 augusti

Krockarna 12–14 augusti (0,0 timmar mellan nejet och nästa samtal) var
kapplöpningen som migration 017 och arbetslåset täppte, och de slutade den
14:e. Det här är en annan bugg med samma symptom: den 27 augusti ringdes fyra
sådana samtal, den 28:e sju, och det snabbaste låg 23,2 timmar efter nejet —
alltså strax efter att 20-timmarsvilan löpt ut. Regeln fungerade precis som
den var skriven. Den var skriven fel.

### Lösningen

`retryDaysNo` i `DialerConfig`, **60 dagar**, med ett nytt steg 4 i
`computeNext` som gäller varje `DM_NO`.

- **Utfallet bestämmer, inte anledningen.** Vilan hänger på `DM_NO`, inte på
  `noReason`. Anledningen är statistik — den säger varför vi förlorade, inte
  hur snart kunden vill höra av oss igen, och svaret på den frågan är detsamma
  för alla åtta. En gren per anledning hade blivit åtta tal att hålla reda på
  och åtta sätt för samma bugg att komma tillbaka.
- **Före taket.** Steg 5 ger 30 dagars vila vid taket. Låg nej-grenen efter
  hade ett nej på åttonde försöket fått den *kortare* vilan, alltså ett hål
  precis där bolaget ringts som mest.
- **`VILL_EJ_PRATA_SALJARE` kan bara förlänga.** `noRestDays` tar
  `MAX(retryDaysNo, retryDaysNoSalespeople)`. Den knappen betyder en hårdare
  hållning än ett vanligt nej och kan omöjligt förtjäna ett snabbare
  återbesök — men den gamla siffran (30) är nu lägre än golvet, så utan
  `MAX` hade den blivit en genväg tillbaka.
- **`attemptCount` nollställs inte.** Ett nej är ett försök som räknas, och två
  nej i rad ska föra bolaget mot taket i stället för tillbaka till ruta ett.
  (Den gamla `VILL_EJ`-grenen nollställde. Den gör inte det längre.)
- **Golvet i inställningarna är 7 dagar**, inte 1. Den enda siffra som orsakat
  ett problem i produktionen är en för låg, och ett oavsiktligt "1" i fältet
  hade återskapat exakt den här buggen via admin-sidan.

### Hålet i avbokningsvägen, igen

`rotationResumeAt` räknade vilan ur `lastResult` ensam. Ett bolag som sagt nej
och **sedan** fått en återkomst inbokad föll därför tillbaka på 20 timmar när
återkomsten avbokades. Samma väg som den 26 augusti lyfte 74 bolag tillbaka i
förtid fick alltså inte bli hålet i nej-regeln också. Den tar nu `lastOutcome`
och `lastNoReason`.

Det krävde två nya kolumner: `Lead.lastOutcome` och `Lead.lastNoReason`,
speglade dit `lastResult` redan speglade resultatet. Utan dem kan varken
avbokningsvägen räkna om vilan eller däcket varna för ett nej utan att gå till
CallAttempt-historiken.

### Säkerhetsnätet — vägarna runt rotationen

Rotationen delar inte längre ut ett nej-bolag. Men `leaseSpecificLead`
**struntar med flit i däckets filter**, så ⌘K, sökträffen på Ringlistor och
knappen på `/leads/[id]` går rakt förbi 60-dagarsvilan. Den vägen ska vara
öppen — ibland finns ett skäl — men den får aldrig vara omärkt, annars är den
den enda kvarvarande vägen till samtalet golvet klagade på.

Ny varning över bolagsrubriken: *"Sa nej i tisdags — Inget behov. Vilar till
27 okt"*, i `danger` och inte `warn`: ett nej är ett besked från kunden, inte
ett administrativt tillstånd som "taket är nått".

Mappvyn säger samma sak. `deckState` skiljer nu `resting` med `saidNo` från en
vanlig rotationspaus, och raden står **"Sa nej"** i stället för "Vilar". Samma
tillstånd i däcket, men inte samma sak för en människa som funderar på att
öppna bolaget ändå.

### Läkning av datan

`022_nej_vilar_60_dagar.sql` backfillade de två kolumnerna ur senaste
CallAttempt-raden och räknade om `nextActionAt` för varje bolag vars senaste
samtal var ett nej.

**634 ringbara nej-bolag före, 0 efter.** 907 ligger nu på oktober.

Vilan räknas från **samtalet**, inte från migrationen: ett nej från den 13:e
är ringbart den 12 oktober, inte 60 dagar från idag — bolaget ska inte straffas
för att buggen fanns. `MAX`-villkoret gör att ett bolag som redan låg längre
bort aldrig dras närmare. Spärrade bolag, kunder och de **4** med öppen
återkomst rördes inte: ett lovat samtal rankar över vilan, och att skriva en
framtida tid på ett spärrat bolag hade sett ut som ett löfte om att det kommer
tillbaka.

**Fotnot om datumformatet, som kostade tid:** `turso db shell` *visar*
`nextActionAt` som `2026-08-10 09:15:00`. Det är shellens formatering. Det som
faktiskt ligger i kolumnen är `2026-08-10T09:15:00.000+00:00` — 29 tecken, `T`
som separator, `+00:00` och **inte** `Z`. Jämförelserna är textbaserade, så en
migration som skriver ett annat format sorterar fel mot resten av tabellen.
Kontrollera med `substr`/`length`, aldrig med ögat. Verifierat efteråt: alla
rader bär fortfarande ett och samma format.

---

## 2026-08-28 — "Nästa" band upp bolaget i en kvart

Rapporterat från golvet: *"när jag trycker på nästa i cockpit så blir det som
att jag har ringt kunden."*

Stämmer, och det syntes inte i datan — för ingenting skrevs. `advance()`
flyttade bara markören. Arbetslåset (`Lead.leasedById` / `leasedUntil`) låg
kvar, och därifrån föll bolaget mellan tre stolar:

- `syncLeases` förnyar bara `slice(index)`, alltså kön **framför** markören. Ett
  passerat bolag ligger bakom den och rörs aldrig.
- Sessionens avslut släppte också bara `slice(index)`, på antagandet att allt
  bakom markören var dispositionerat — vilket `recordAttempt` mycket riktigt
  hade släppt låset på. Ett *passerat* bolag är också bakom markören, och det
  hade ingen släppt.
- Rotationen kräver `leasedUntil IS NULL OR leasedUntil < now`.

Nettot: ett tryck på Nästa gjorde bolaget osynligt för hela golvet — inklusive
säljaren själv — tills leasen gick ut en kvart senare. Från stolen är det
oskiljbart från ett ringt bolag: det försvann ur kön utan utfall.

**Det fanns redan en knapp som gjorde rätt.** `Skippa (S)` släppte låset och
gick vidare. Den satt bredvid `Nästa`, såg ut som samma sak, och `Nästa` var
den säljarna tryckte på. Två knappar för samma avsikt, där den självklara var
den som band upp bolaget.

`passLead` (release + advance) är nu den enda vägen förbi ett bolag, på knappen
`Nästa`, på `S` och på `→`. `Skippa` är borta. `advance` finns kvar som ren
markörflytt och används bara där låset redan är släppt: efter en disposition
(`recordAttempt`) och efter en radering (`markNoPhoneFound`).

### Samma hål på tre andra ställen

- **⌘K mitt i kön.** `openLeadById` sa i sin egen kommentar att det pågående
  bolaget "hoppas över precis som med `s`" — men anropade `advance`. Varje
  uppslagning parkerade alltså bolaget säljaren stod på. Anropar `passLead` nu.
- **Sessionens avslut** släpper hela kön i stället för `slice(index)`.
  `leasedById = ?` i WHERE gör det ofarligt att skicka för mycket: id:n jag inte
  håller matchar ingenting. Uträkningen av "vilka är kvar" var själva felet, så
  den är borttagen i stället för lagad. `releaseLeases` kör i block om 200 —
  kön är över hundra id:n mot slutet av ett pass.
- **Påfyllningen.** `refill` leasar på servern och filtrerade sedan bort
  dubbletter i klienten. Ett passerat bolag är ringbart igen och kan komma
  tillbaka direkt i nästa block — låset togs, raden kastades, och bolaget låg
  låst utan att synas för någon. Dubbletterna lämnas nu tillbaka.

### Ett falskt övertagandeband

Med releasen på plats hade `Föregående` tillbaka till ett passerat bolag mötts
av bandet *"En kollega har …"* om en kollega som inte finns: `renewLeases`
rapporterar ett id som förlorat så fort det inte längre är mitt, oavsett varför.
Servern visste redan skillnaden — `holder` är null när ingen annan håller
bolaget — men klienten läste inte fältet. Den yankar nu bara förluster **med**
innehavare. `holder` föll också tillbaka på `null` om namnuppslagningen missade,
vilket hade dolt en riktig krock; fallbacken är nu `"En kollega"`.

### Läkning av datan

`021_lakning_passerade_arbetslas.sql` släppte **61 lås**, 58 på bolag som aldrig
ringts. Alla 61 låg i `hantverkare_5000_alla` — samma mapp golvet rapporterade
från. Efteråt: 0 kvar, 4 352 ringbara bolag i mappen.

Urvalet är låsets **färskhet**, inte dess skäl: kolumnen bär ingen anledning, så
ett passerat bolag går inte att skilja från ett obearbetat i själva raden. Men
cockpiten förnyar kön framför markören var femte minut på en lease som lever i
femton, så ett lås som fortfarande används har alltid mer än tio minuter kvar.
Under det förnyas det av ingen. Gränsen sattes vid nio minuter.

Mätt strax innan ändringen, 13:33 UTC med fem säljare online: 158 aktiva
arbetslås. Hur många som var passerade bolag går inte att läsa ut i efterhand —
låset bär inget skäl — och det är hela anledningen till att felet levde så
länge. **Fotnot till mätningar mot den här databasen:** `datetime('now')` ger
`YYYY-MM-DD HH:MM:SS` medan kolumnerna är ISO med `T` och `Z`. Jämförelsen är
textbaserad, så `'…T06:56Z' > '… 13:33'` är sant. Använd
`strftime('%Y-%m-%dT%H:%M:%S.000Z','now')`.

---

## 2026-08-26 (senare) — Varför bolag dök upp igen: tre olika hål

Rapporterat från golvet: *"listan gör att kunderna dyker upp igen, en säljare
tryckte på inget telefonnummer men jag gick in i dialern och fick upp leadet
ändå."*

Alla elva utfall granskades mot sina regler, i produktionsdatan i stället för i
koden. **Åtta av elva regler höll perfekt.** Det som inte höll var tre saker
som alla ser ut som samma symptom från golvet men har olika orsaker.

### Vad som höll

| Regel | Utfall |
|---|---|
| Terminala utfall spärrar | 206/206 `WRONG_NUMBER` retired, 1/1 `SOLD` |
| Taket (8 försök) | 0 leads över taket var ringbara |
| `Lead.callbackAt` ↔ öppen `Callback` | 0 avvikelser i **båda** riktningarna |
| Öppet löfte utanför däcket | 0 spärrade leads med öppen återkomst |
| "Vill ej prata med säljare" → 30 dagar | 138/138 nollställda, 136/138 med rätt vila |
| Claim-låset (migration 017) | 0 felaktiga lås efter 2026-08-13 |

Krockar mellan säljare — två som ringer samma bolag inom en timme — finns i
datan, men **bara 12–17 augusti**: 49 den 13:e, 26 den 14:e, 3 den 17:e, och
noll den 20, 21, 24, 25 och 26. Migration 017 och arbetslåset täppte det, och
det syns.

### 1. En avbokad återkomst la bolaget ÖVERST i kön

`syncLeadFromCallbacks` skrev `nextActionAt = NULL` när sista öppna återkomsten
försvann, med kommentaren "alltså ringbart direkt". Två fel i ett:

- Vilan som utfallet tjänade ihop försvann med löftet. Ett bolag som fick ett
  nej i morse blev ringbart i samma sekund någon avbokade dess återkomst.
- **`ORDER BY l."nextActionAt" ASC` sorterar NULL först i SQLite.** Bolaget kom
  alltså inte tillbaka i kön — det kom tillbaka *överst* i den, före varje bolag
  som faktiskt väntat ut sin tur. Därav upplevelsen att samma bolag kom om och
  om igen.

Mätt: **74 leads** låg med `nextActionAt = NULL` och `retired = 0`, och **alla
74** hade en avbokad återkomst bakom sig. Hundra procent.

`rotationResumeAt` i scheduler.ts räknar nu fram tiden ur `lastAttemptAt` +
vilotiden för `lastResult`. Ett avbokat löfte betyder att löftet är borta, inte
att bolaget aldrig ringts. Leads som *aldrig* ringts får fortfarande `null` —
de är obearbetade, inte vilande, och det är skillnaden hela grenen finns för.
Samma veva släpps `claimedAt`: låset finns för att skydda ett personligt löfte,
och finns löftet inte kvar finns ingen relation att skydda.

### 2. Raderingen var systemets enda oskyddade skrivning

"Inget telefonnummer" gick förbi skriv-bakom-kön — tre direktanrop med
`.catch(() => {})`. Systemets enda oåterkalleliga åtgärd hade alltså som enda
åtgärd **ingen felhantering alls**: ett nätverksglapp, en utgången session eller
ett serverfel svaldes tyst, bolaget låg kvar, och säljaren hade redan sett
bekräftelsen försvinna från skärmen. Nästa pass fick samma bolag igen.

Att det aldrig syntes i datan är i sig ett tecken: `retiredReason =
'inget_nummer'` har **noll** rader i hela databasen, trots att grenen finns för
bolag som ringts förut.

Går nu genom samma kö som dispositionerna, med `kind: "noPhoneFound"` — omförsök
vid nätverksfel, `keepalive` när fliken stängs, och en synlig remsa när det ändå
inte gick. Femsekundersfristen är kvar; det som ändrats är vad som händer när
den löper ut.

### 3. Mappen visste ingenting om rotationens regler

Det här är vad "**listan** gör att kunderna dyker upp igen" bokstavligen
beskriver. `/lists/[id]` kände inte till `retired`, `hasActiveDeal`,
`callbackAt`, `nextActionAt` eller spärrlistan. Ett spärrat bolag, en kund, ett
bolag med öppet löfte och ett bolag som vilar renderades exakt som ett
obearbetat lead — och gick att öppna rakt in i dialern därifrån, eftersom
`leaseSpecificLead` med flit struntar i däckets filter.

I `Clicknet Lista 1`: **831 av 5 668 bolag** — 192 spärrade, 2 kunder, 175 med
öppet löfte, 462 vilande. Femton procent av mappen såg ringbar ut och var det
inte.

`src/lib/deck-state.ts` speglar nu däckets WHERE-sats som ren logik. Raden bär
skälet ("Fel nummer", "Kund", "Lovad återkomst 3 sep", "Vilar till 28 aug"),
rubriken räknar **ringbara** i stället för lediga — ledig svarar på om någon
annan håller bolaget, ringbar på om det finns arbete kvar — och två nya filter
skiljer ringbart från det som ligger ur rotationen. De två implementationerna är
avsiktligt separata men får aldrig säga olika saker: **ändras däckets villkor
ska `deck-state.ts` ändras i samma commit.**

### Läkning av datan

`020_lakning_avbokade_aterkomster.sql` räknade om de 74 leadsen (0 kvar) och
släppte 20 av 23 kvarglömda claim-lås från före migration 017. De tre som står
kvar har en öppen återkomst — låset skyddar ett levande löfte och ska ligga
kvar. 28 andra gamla lås rördes inte av samma skäl.

---

## 2026-08-26 — Ett manus kan höra till en enskild ringlista

Fram till nu fanns **ett** manus per ramverkssteg, gemensamt för allt som
ringdes. Det håller så länge alla mappar innehåller samma sorts bolag, och det
gör de inte: `leads_bygg_hantverk` och en mapp med redovisningsbyråer öppnas
inte med samma mening. Utvägen var att skriva om det allmänna manuset inför
varje kampanj — och eftersom en redigering skapar en ny version river det sönder
statistiken varje gång: gammalt utfall pekar på en text ingen längre använder.

`ScriptTemplate.listId` (migration `019_manus_per_lista.sql`):

| | |
|---|---|
| `NULL` | manuset gäller alla mappar — allt som fanns före migrationen |
| satt | manuset gäller **bara** den mappen |

### Ersätter, kompletterar inte

`getActiveScripts(listId)` tar mappens manus för de steg mappen skrivit, och det
allmänna för resten. Två manus för samma steg på skärmen samtidigt är samma sak
som inget manus — ingen läser två alternativ mitt i ett samtal. Följden är att en
kampanj bara behöver skriva om det steg som faktiskt skiljer sig, oftast
öppningen, och slipper kopiera fem steg för att ändra ett.

**Utan mapp gäller bara de allmänna.** Ett bolag som slås upp med ⌘K eller
`?leadId=` kan ligga i vilken lista som helst; ett kampanjmanus ska inte läcka ut
på det. `leaseSpecificLead` avgör därför mappen **före** hydreringen — den vet
redan vilken mapp cockpiten kommer att köra i, och manuset måste vara samma
mapps, annars läser säljaren ett manus som hör till en annan lista än rubriken
ovanför.

### Raderad mapp får inte göra kampanjmanuset allmänt

FK:n är `ON DELETE SET NULL`, inte `CASCADE`: en publicerad version ligger på
CallAttempt-rader och bär statistikens koppling till vad som faktiskt sades — en
kaskad hade tagit bort just den texten. Men `listId = NULL` **betyder** "gäller
alla", så nollningen ensam hade släppt ut kampanjmanuset på hela golvet i samma
sekund som mappen raderades. `deleteList` inaktiverar därför mappens manus
**före** borttagningen. Texten överlever, räckvidden gör det inte.

### I gränssnittet

- `/admin/scripts` grupperar manusen under "Alla mappar" och en rubrik per mapp.
  Räckvidden ligger i en väljare **ovanför texten**, inte i en inställningsruta
  någon annanstans: den är minst lika avgörande som orden och ska synas medan
  man skriver dem. Att flytta ett manus mellan mappar rör aldrig texten, så ett
  kampanjmanus kan lyftas till att gälla alla utan att en rad skrivs om.
- Förhandsgranskningen av ett mappmanus körs mot ett bolag **ur mappen**.
  Underlaget avgör vilken variant som vinner, så ett lead ur en annan lista
  visar fel rad — och just den kontrollen är hela poängen med granskningen.
  Exempelleadet ligger medvetet **inte** i redigerarens `key`: en ommontering
  när mappens lead hämtats klart hade kastat det som redan skrivits.
- Mappvyn visar "Eget manus: Intro" när mappen har ett publicerat eget. Utan den
  raden syns kopplingen bara inne i manusvyn, och en säljare som möter en annan
  öppning än vanligt läser den som ett fel att rätta till.

---

## 2026-08-25 (senare) — "Mappen är slut" var sant, förklaringen var det inte

Rapporterat från golvet: `leads_bygg_hantverk` möttes av *"0 samtal denna
session. Inga fler leads är ringbara just nu — resten väntar på sin tur i
uppföljningen."* Mappen har 1 000 bolag och var importerad samma dag.

Räknat i produktionsdatan i stället för läst i koden:

| | |
|---|---|
| Bolag i mappen | 1 000 |
| **Utan ett enda telefonnummer** | **986** |
| Med kontakt, utlånade till säljaren själv | 14 |
| Vilande, låsta, spärrade, med öppen återkomst | 0 |

Källfilen `leads_bygg_hantverk.csv` har en `Telefon`-kolumn, och den är tom på
alla 1 000 raderna. De 14 som gick att ringa hade nummer sedan tidigare, från
en annan import som matchade på org-nummer. **Ingenting väntade på sin tur.**
Ingenting kunde någonsin ringas.

### Filtret var felet, inte filen

Första ansatsen var att göra tomlägets text sann. Den räckte inte: **ett bolag
utan nummer är inte färdigbehandlat, det är obearbetat.** Numret finns på
bolagets sajt, i Hitta.se eller hos växeln — ett par minuters arbete, inte ett
hinder. Att filtrera bort bolaget gör att ingen kan göra det arbetet, och 986
bolag ligger osynliga i en mapp som ser tom ut.

`EXISTS (SELECT 1 FROM "Contact" …)` är därför borta ur `leaseNextLeads`.
Bolag utan nummer delas ut som vilket bolag som helst, med en tillagd
ORDER BY-gren som lägger dem **sist**: ett pass ska börja med samtal, och
uppslagningarna blir det man gör när det ringbara är slut i stället för ett
avbrott mitt i rytmen.

Cockpiten har fått `AddNumberCard` för de bolagen — sex uppslagningar, alla i
egen flik (en navigering hade delat ringsessionen i två), och ett fält som
sparar numret på leadet direkt. De två registren slås upp på
**org-numret utan bindestreck** när det finns: `merinfo.se/search?who=5594490830`
ger en träff i stället för en lista, och `allabolag.se/5594490830` går rakt in på
bolagssidan. Utan org-nummer faller de tillbaka på namnet. Google söker på
enbart bolagsnamnet — numret ligger oftast i bolagsrutan eller en katalogträff,
och varje extra ord i frågan kan sålla bort just den träffen.

**Hitta.se, Eniro och BraByggare tillkom 2026-08-26** på beställning. Tre saker
som bara gick att få reda på i en webbläsare — sajterna svarar 403 på curl:

- **Hitta.se** tar `?vad=` och hoppar direkt till bolagssidan när träffen är
  entydig. Orten skickas med, den är det som gör den entydig.
- **Eniro** har sökordet i sökvägen, inte som parameter:
  `/boochbygg+p%C3%A5+svedjeudden+ab/företag`. `?q=` och `/namn` ger båda 404.
  Formatet hittades genom att fylla i deras egen sökruta och läsa av URL:en.
  Värt besväret: Eniro visade ett mobilnummer på ett av bolagen i
  `leads_bygg_hantverk` som saknar nummer hos oss.
- **BraByggare går inte att länka till ett enskilt bolag.** Första försöket
  var en `site:`-sökning mot domänen, och den gav ingenting — undersökt i
  webbläsaren dagen efter, och skälen är fyra: söket kräver postnummer **plus**
  kategori och tar inget bolagsnamn; resultatet byter aldrig URL, så inte ens
  en kategorisökning går att spara som länk; bolagssidorna ligger på interna
  id:n (`/hantverkare/3343/`) som bara finns i deras databas; och sitemapen har
  476 URL:er och **noll** bolagssidor, så Google har inget indexerat att
  träffa. Sidan visar dessutom inget telefonnummer, bara beskrivning, omdömen
  och hemsida. Länken går nu till söksidan. Vill man ha bolaget måste säljaren
  söka på postnummer och kategori på plats — värdera den mot de fem andra innan
  den får ligga kvar. Förvalt kontaktnamn är
"Växeln": det vanliga fyndet på ett litet bolag är företagsnumret, inte en
namngiven beslutsfattare, och ett tomt namnfält hade tvingat säljaren att hitta
på något innan numret gick att spara. Numret läggs på leadet i kön också, inte
bara i databasen — annars hade kortet sagt "inget nummer" tills bolaget
hämtades om.

`createContact` normaliserar nu till E164. Den gjorde det inte: cockpiten ringer
på E164-fälten, så ett handskrivet nummer hade synts i kortet utan att gå att
ringa — precis den återvändsgränd rutan finns för att ta bort. (Samma sak
förklarar de 16 leads i basen som har råtelefonnummer utan E164; de kom in via
importen där `toE164` inte kunde tolka texten.)

### Meningen var skriven en gång och gällde alltid

`exhausted && " …resten väntar på sin tur i uppföljningen."` — en sträng utan
villkor, som påstod en orsak skärmen inte hade frågat efter. Skillnaden mellan
"kom tillbaka om en timme" och "den här filen behöver nummer innan den är värd
ett pass" är hela skillnaden mellan att vänta och att åtgärda, och säljaren fick
den förra när det var den senare som gällde.

`deckStatus(listId)` i `actions/dialer.ts` räknar nu upp skälen, och tomläget
listar dem med siffror: spärrlista, öppen återkomst, låst av kollega, maxade
försök, vilande — med klockslag för när nästa bolag blir ringbart.
**Villkoren speglar `leaseNextLeads` rad för rad** — ändras ett filter där måste
det ändras här, annars förklarar skärmen ett däck som inte finns. Varje lead
räknas en gång, på sitt första skäl, annars summerar delarna till mer än
helheten och siffrorna slutar gå att lita på.

Kravet på nummer finns inte längre bland skälen, av den enkla anledningen att
det inte längre hindrar något.

### Importen visste det här och sa ingenting

En import där 986 av 1 000 leads saknar nummer räknades som 986 skapade och såg
ut som en fullträff. Slutsteget varnar nu: `withoutPhone` räknas i
`/api/import-stream` — ett lead utan nummer i **både** filen och det som redan
står i systemet — och visas i en gul ruta. Bolagen går att bearbeta, men de
kostar en uppslagning var, och det är ett helt annat pass än en fil med nummer.
Den som laddar upp ska veta det när den laddas upp, inte när säljaren sitter
där.

### Dispositionsraden: två knappar bort, en till

**Borttagna:** "Upptaget" och "Röstbrevlåda". Beställt — de användes inte, och
varje knapp i resultatsteget är ett val som görs 150 gånger om dagen.
Enumvärdena `BUSY`, `VOICEMAIL_LEFT` och `VOICEMAIL_NO_MESSAGE` står kvar i
schemat: loggen är oföränderlig, och telefonikopplingen
(`lib/telephony/normalize.ts`) sätter dem fortfarande automatiskt från Lynes
statuskoder. Därför finns nu `RESULT_LABELS` bredvid `RESULT_OPTIONS` —
knapparna säger vad som *erbjuds i dag*, etiketterna vad som *står i
historiken*. Utan uppdelningen hade ett samtal från i juni renderats som
`VOICEMAIL_NO_MESSAGE` i det ögonblick knappen togs bort.

**Ny:** "Inget telefonnummer" (tangent 5). Den hör ihop med att bolag utan
nummer numera delas ut: utan en väg ut kommer bolaget tillbaka i nästa block
och nästa säljare gör om exakt samma sökning på Merinfo, Allabolag och Google.

Knappen sitter bland dispositionerna men **skriver inget samtal**. Inget samtal
ringdes, och `db.callAttempt.count()` är vad statistiken kallar "samtal" — en
rad där hade blivit ett samtal i dagsmålet, i coachingvyn och i
svarsfrekvensens nämnare. Värdet ligger därför utanför `CallResult`
(`NO_PHONE_FOUND` i `cockpit-flow.ts`, `as const` så att typen inte kollapsar
till `string`).

**Leadet raderas** — beställt samma dag, efter att första versionen bara
pensionerade det: ett bolag ingen kan ringa ska inte ligga kvar och se ut som
ett lead. Raderingen kaskaderar bort kontakter, aktiviteter och kopplingen till
mappen, så bolaget lämnar ringlistan helt.

Tre saker det för med sig:

- **Inget spår och ingen väg tillbaka.** `Activity.leadId` är obligatorisk och
  kaskaderar, så en logg-rad om raderingen hade raderats med leadet. Bolaget
  måste importeras på nytt. Spärrlistan överlever dock — `DoNotCall` är nycklad
  på numret och sätter bara `leadId` till null.
- **Säljare får radera här.** `deleteLead` i `actions/leads.ts` är admin-bara,
  med motiveringen att aktivitetsloggen är oföränderlig och att vägen inte får
  stå öppen för säljare. Den står öppen här, med flit och bara för den här
  knappen: det är säljaren som gör uppslagningen och det är i cockpiten
  beslutet fattas.
- **Historik skyddas.** Har bolaget ringts förut, eller finns en affär på det,
  pensioneras det i stället — statistiken för de samtalen ska inte försvinna
  för att ingen hittade ett nytt nummer i dag. Sällsynt i praktiken: bolagen
  knappen finns för har aldrig haft ett nummer.

**Ångerfrist, byggd samma dag.** Ett feltryck på 5 raderar ett bolag utan fråga,
i ett flöde där säljaren trycker siffror 150 gånger om dagen — och raderingen
har ingen väg tillbaka. Skrivningen skickas därför efter fem sekunder, med en
toast som säger vilket bolag som är på väg bort och en ångerknapp.

Fyra detaljer som avgör om en sådan frist håller:

- **Kön går vidare direkt.** Fristen är en ångermöjlighet, inte en väntan.
  Säljaren är redan på nästa bolag när toasten ligger kvar — därför står
  bolagsnamnet i den, hen ser inte längre bolaget hen tryckte på.
- **Ångra tar en tillbaka till bolaget**, inte bara avbryter skrivningen.
  Leadet ligger kvar leasat och dyker inte upp igen av sig självt under passet,
  så ett avbrutet anrop utan hopp hade lämnat bolaget obearbetat bakom ryggen
  på säljaren.
- **Väntande radering ligger i en ref.** Cleanupen som körs när fliken stängs
  ser bara refs, och där skickas skrivningen i stället för att dö med timern:
  säljaren tryckte och ångrade sig inte. En ny radering skickar dessutom den
  förra direkt, så två i rad aldrig kvittar ut varandra.
- **Toasten renderas på två ställen**, cockpiten och tomläget. Raderar säljaren
  sitt sista bolag byter skärmen i samma ögonblick, och i den ena vyn hade
  fristen försvunnit osedd i precis det läge där felet är dyrast.

Känd kant: det raderade leadet ligger kvar i klientens kö, så pil vänster kan ta
säljaren till ett bolag som inte längre finns. Kräver två avsiktliga tryck bakåt
och ger ett serverfel, inte tyst fel data.

Knappen är bortfiltrerad i `CallbackDisposition` — och tangent 5 grindad där —
eftersom en återkomst per definition är ett löfte om att ringa ett nummer någon
redan haft i luren.

### Hittat på vägen: `nextActionAt` jämförs mot fel strängformat

Prisma lagrar DateTime i SQLite som `2026-08-26 09:15:00` — utan tidszon, alltid
i UTC. `leaseNextLeads` binder i stället full ISO (`2026-08-26T09:15:00.000Z`)
och jämför **som text**. På position 10 står blanksteg (0x20) mot `T` (0x54), så
ett Prisma-skrivet datum är alltid mindre än ett ISO-datum samma dygn:
`nextActionAt <= now` blir sant för allt som vilar senare *idag*. **Vilan
släpper alltså upp till ett dygn för tidigt**, systematiskt, bara inom samma
datum. Inte rört här — det ändrar vad rotationen delar ut och förtjänar ett eget
pass med en normalisering av kolumnen. `deckStatus` jämför likadant med flit, så
att förklaringen matchar det däcket faktiskt gör.

---

## 2026-08-25 — Registreringsdatum följer med importen (migration 018)

Ny kolumn i importen: **Registrerat / Grundat** → `Lead.registeredAt`. Den finns
i praktiskt taget varje företagsregisterexport och säger något om bolaget utan
att någon behöver ringa det — ett bolag registrerat i mars i år är ett annat
samtal än ett som funnits sedan 1994.

Fyra val värda att veta om:

**Filen skickar råtext, servern tolkar.** Samma ordning som SEO-placeringen
redan använder. Klienten skickar cellen som den står och
`/api/import-stream` avgör vad som är ett datum. Endpointen tar emot JSON
utifrån och får ändå inte lita på klienten, så tolkningen måste finnas där —
och då ska den inte finnas på två ställen med två resultat.

**Tolken bor i `src/lib/import-date.ts`, inte i `csv-parser.ts`.** Enda skälet:
csv-parser importerar `xlsx`. Att dra in ett kalkylbladsbibliotek i en
serverless-funktion för en datumsträngs skull är inte värt det. Filen är rena
funktioner och körs på båda sidor — förhandsgranskningen använder samma tolk som
skrivningen, så en feltolkad kolumn syns i tabellen *innan* 3 000 rader skrivits.

**Dag före månad när det är tvetydigt.** `03/04/2019` blir 3 april. Filerna
kommer från svenska register; den amerikanska ordningen hade varit en gissning
på det ovanligare fallet. Går dag-först-läsningen inte ihop (`03/25/2019`) läses
filen amerikanskt i stället för att svara tomt. Excels serienummer hanteras
också — ett datumformaterat Excel-fält kommer ut ur `sheet_to_json` som talet
43538, och utan omräkningen hade varje xlsx-fil gett en tom kolumn.

**Ett årtal ensamt landar på 1 januari.** Påhittad precision på dagen, men
frågan kolumnen finns för är hur gammalt bolaget är, och det svaret blir rätt.
Alternativet var att slänga uppgiften. Utanför 1800–nästa år sparas ingenting:
ett registreringsdatum 2087 är en feltolkning, inte en uppgift.

Automappningen känner igen `registreringsdatum`, `registrerad`, `grundat`,
`bildat`, `startdatum`, `etablerad` och de engelska motsvarigheterna. Regeln
ligger **efter** bolagsnamnsregeln med flit: en kolumn som heter "Företaget
registrerat" ska hellre bli bolagsnamn av misstag än att bolagsnamnet — det enda
obligatoriska fältet — kapas av en datumregel. Reglerna är explicita och inte
`includes("reg")`, som hade svalt "Region" och "Regnr".

**Uppföljning samma dag:** året står nu i cockpitens bolagsrad, mellan
omsättning och org-nummer — "Registrerat 2023". Bara året, inte datumet: det är
vad man säger i ett samtal, och för de leads där filen bara bar ett årtal är
dagen ändå påhittad. `registeredAt` fick läggas till i `hydrateLeads` select
för att komma dit; kolumnen fanns i databasen men inte i det cockpiten hämtar.
Kvar: `/leads/[id]` visar det fortfarande inte.

---

## 2026-08-20 (senare) — Återkomstklockan flyttar in i cockpit

Notisklockan fanns redan och var genomarbetad. Problemet var var den satt:
`cockpit/layout.tsx` säger `// Cockpit is fullscreen — no sidebar`, och klockan
bor i `AppSidebar`. Enda vägen till sina egna löften var alltså att lämna
ringpasset — vilket ingen gör mitt i ett samtal, och därför gjorde ingen det
alls. Rapporterat från golvet som "vi måste gå ut hela tiden för att kolla".

`CallbackBell` i `components/cockpit/` är en andra klocka, inte en flyttad.
Sidomenyns klocka är kvar oförändrad, och skillnaderna är alla avsiktliga:

**Bara det som är dags visas.** Sidomenyns klocka listar också "senare idag"
och "kommande" — den är en planeringsvy. Den här är ett avbrott i ett pass, och
allt som inte kräver ett samtal inom fem minuter är brus. Brus i cockpit kostar
samtal.

**Fem minuters förvarning, samma gräns som sidomenyn.** Beställningen var
egentligen "exakt på utsatt tid", men femman vann efter att avvägningen lagts
fram: en notis som kommer på slaget når en säljare som redan sitter i ett annat
samtal. Två klockor med olika larmtid hade dessutom varit svårare att förklara
än regeln "fem minuter innan" på båda.

**Raden är knappen.** Inga snooza-, avboka- eller mejlknappar — de finns kvar i
sidomenyns klocka, där det finns plats att fundera. Här gör man en sak: trycker
på bolaget och hamnar i det. Vägen dit är `openLeadById`, samma som
⌘K-sökningen redan använde; bolaget reserveras och läggs först i kön utan att
ringsessionen bryts.

**Notisen kommer när tiden går in, inte när säljaren loggar in.** Bara rader som
passerar femminutersgränsen medan cockpiten står öppen ger en notis. Det som
redan var förfallet vid passets start ligger i klockan med röd siffra. En skärm
som möts av fyra notiser vid inloggning lär säljaren att klicka bort dem utan
att läsa, och då är hela mekanismen värdelös.

### Två fällor som hade bitit

**`answeredCallbackId` måste följa med.** `recordAttempt` stänger annars bara
återkomster vars tid *redan passerat* (`scheduledAt <= now`). Eftersom klockan
larmar fem minuter för tidigt hade ett samtal ringt 13:57 på ett löfte klockan
14:00 lämnat löftet öppet i klockan efteråt. Cockpiten minns därför vilken rad
som ledde till bolaget, i en ref per lead, och tömmer den i `commit`.

**Tangentbordet läcker.** Cockpitens dispositionsgenvägar ligger på `window`
och har som enda grind att markören står i ett fält. Panelen har inga fält, så
ett tryck på "1" medan säljaren läste en återkomst hade bokfört ett samtal på
bolaget hen råkade stå på. Panelen fångar därför tangenttryck i capture-fasen,
alltså före `window`, och släpper igenom meta/ctrl så att ⌘K fortfarande når
fram. *Samma läcka finns kvar överallt annars där ett lager saknar textfält —
värd en genomgång, inte en punktinsats.*

Varningen "X lovade återkomma" i `leaseSpecificLead` säger nu "Du lovade
återkomma" när det är ens eget löfte. Vägen in går numera ofta genom sitt eget
löfte, och att läsa sitt eget namn i en varningsruta läser man som ett fel.

Inget ljud. Säljaren sitter med headset och kan ha en kund på tråden; ett pling
i lurarna mitt i en invändning hörs även av kunden om mikrofonen är öppen.

### Notisen blev ett band, och glaset är ett undantag med täckning

Efter första skarpa passet: klockan fungerade, men notisen var en liten ruta i
övre högra hörnet. Beställningen blev ett brett rött band med glas, som en
iPhone-notis. Fyra saker det tvingade fram:

**Glaset är tillåtet här, och det är inte en genväg.** `CLAUDE.md` listar
"glassmorphism på element som inte svävar" bland det som inte får komma
tillbaka — men undantaget står i samma mening: `backdrop-filter` hör hemma på
lager som ligger *över* innehåll. Ett notisband är precis det. Genomsikten bär
dessutom något: säljaren ser att bolaget under fortfarande är kvar, alltså att
bandet är ett tillägg och inte ett skärmbyte.

**`--danger-bg` gick inte att använda.** Den är 8 % och kan inte bära
`--on-danger` — vit text på den är oläsbar. Två nya tokens i `globals.css`:
`--danger-glass` (samma bas, 82 %) och `--danger-glass-edge` (den ljusa kanten
som får glas att läsa som glas). Kontrasten är räknad i båda temana: 5,6:1 i
ljust, 6,4:1 i mörkt. Färgen ligger i tokenet och inte i komponenten, för det
var precis så de tretton hårdkodade värdena uppstod förra gången.

**`@supports not (backdrop-filter)` behövs.** Utan stöd blir bandet
genomskinligt rött *över* text, alltså oläsbart. Fallbacken är full täckning.
En glaseffekt som degraderar till oläslighet är värre än ingen glaseffekt.

**Bredden är `clamp(360px, 50vw, 760px)`, inte `50%`.** Beställningen var "ca
50 % av cockpiten", och ren procent går sönder i båda ändarna: halva bredden på
en delad laptopskärm är 300 pixlar och kapar bolagsnamnet, halva bredden på en
34-tumsskärm är ett band på nästan tusen pixlar som läser som ett layoutfel.

### Timern var fel åt båda hållen

Efter andra passet: bandet försvann inte när det skulle och försvann när det
inte skulle. Tolvsekunderstimern var fel på två sätt samtidigt.

**Den försvann för tidigt.** En säljare som sitter i ett samtal när bandet
kommer hinner inte läsa det innan nedräkningen är slut. Ett löfte som
försvinner för att en klocka tickat är precis hur löften tappas bort — samma
fel som klockan var byggd för att laga.

**Och den försvann för sent.** När samtalet väl var ringt låg bandet ändå kvar
i upp till en minut: klockan pollar var sextionde sekund och dispositionen går
dessutom genom skriv-bakom-kön. Ingen signal gick från cockpiten till klockan.

Regeln är nu **bandet går bort när bolaget är ringt, inte annars.** `commit`
sätter `calledLead` och klockan plockar bort raden lokalt i samma ögonblick.
Ingen ny fråga till servern skickas: nästa ordinarie hämtning bär sanningen.
Gick skrivningen igenom kommer raden inte tillbaka; gick den inte igenom kommer
den tillbaka och larmar om — vilket är rätt, för då är löftet fortfarande
ohållet. Felet läker alltså synligt i stället för att gömmas.

Utan timern behövdes en spärr till: **bandet får inte överleva sin egen
återkomst.** Samtalet är den vanliga vägen ut men inte den enda — raden kan
avbokas eller flyttas i sidomenyns klocka, i en annan flik eller av en admin.
Varje hämtning rensar därför bort band vars rad inte längre är öppen. Ett band
över ett löfte som inte finns är precis den sortens rad man ringer ett bolag i
onödan på.

Krysset finns kvar som "inte nu". Det gömmer bandet men raden ligger kvar i
klockan — ett löfte lämnar klockan på två sätt, det ringdes eller det avbokades,
och en säljare som inte kan få undan tre band från toppen av skärmen har fått
ett problem i stället för en påminnelse. Samma undantag gäller när man klickar
på bandet: det gömmer sig, för annars täcker det bolaget det just öppnade.

Bandet stannar **under** toppfältet i stället för att täcka det. En notis som
lägger sig över "Avsluta" och över klockan den själv kom ur döljer vägen vidare
i samma sekund som den ber om uppmärksamhet. Centreringen sker med
`left/right: 0` och `margin-inline: auto`, inte `translateX(-50%)` — framer-
motions `layout` mäter mot viewporten och får fel svar under en transformerad
förälder. Containern är `pointer-events: none` och bara banden tar emot klick,
annars hade en osynlig ruta legat över manuset i tolv sekunder.

Ingen migration, ingen ny server action — `listCallbacks("mine")` och
`markCallbacksSeen` fanns redan och räckte.

### Öppna punkter

- [ ] **Ingen mätning av om klockan används.** Att en återkomst stängdes med
      `answeredCallbackId` satt är exakt spåret som säger "det här samtalet kom
      ur klockan". Ingen räknar det.
- [ ] **Klockan pollar var 60:e sekund per öppen cockpit.** Med tjugo säljare är
      det tjugo frågor i minuten för data som ändras några gånger om dagen.
      Ofarligt nu, men det är samma sorts kostnad som växtvärken i
      presence-heartbeaten.

---

## 2026-08-20 — Överlämningen av ett bolag lämnar ett spår

Förnyelsen från 2026-08-17 håller kön, men bara i resonemanget: när ett bolag
bytte ägare mitt i ett pass rullade det ur kön och försvann. Nästa gång golvet
rapporterar en dubbelringning fanns ingenting att räkna på — bara samma
resonemang en gång till. `renewLeases` vet exakt när det sker, så den skriver
numera en rad: **`ActivityType.LEAD_LEASE_LOST`**, aktör = säljaren som hade
bolaget i kön, metadata `{ takenById, takenByName }`.

Frågan "händer det fortfarande?" är därmed en SELECT:

```sql
SELECT date(timestamp) AS dag, count(*)
  FROM Activity WHERE type = 'LEAD_LEASE_LOST'
 GROUP BY dag ORDER BY dag DESC;
```

Tre val värda att veta om:

**Bara bolag som någon annan nu håller loggas.** Ett förlorat id utan
innehavare är ingen krock — det är säljarens eget lås som `recordAttempt` eller
`releaseLeases` släppt, med en förnyelse som hann emellan. Hade de räknats med
hade mätvärdet dominerats av dispositioner och aldrig gått att läsa.

**Dedupe på bolag + övertagare, en timme.** Bolaget säljaren står på just nu
yanks aldrig ur kön — det står kvar med sitt röda band tills samtalet är
dispositionerat — och skickas därför in i varje förnyelse resten av passet. Utan
spärren hade en enda överlämning blivit en rad var femte minut. Nyckeln är
bolag + övertagare, inte bara bolag: går samma bolag vidare till en tredje
säljare är det en ny händelse.

**Skrivningen inväntas, till skillnad från loggen i `claimLead`.** En
`void`-promise som lämnas hängande efter att svaret gått ut är inte garanterad
att köras klart i en serverless-funktion, och en mätpunkt som ibland tappar
rader går inte att räkna på. Kostnaden tas bara när något faktiskt gått
förlorat; allt är inlindat i try/catch, för mätningen är aldrig värd ett trasigt
pass.

Raden ligger på bolaget och syns i historiken på `/leads/[id]` — där nästa
säljare som undrar varför kunden fick två samtal samma dag faktiskt tittar.

Ingen migration: `ActivityType` är en Prisma-enum mot SQLite, alltså TEXT utan
CHECK i databasen. Nya värden kräver `prisma generate`, vilket `postinstall` gör
i bygget.

### Öppna punkter

- [ ] **Mätvärdet är fortfarande oläst.** Kör frågan ovan om några dagar innan
      någon rör `leaseBlockSize` eller `leaseMinutes`. Noll rader betyder att
      förnyelsen räcker; rader varje dag betyder att blocket är för stort eller
      att någon hamstrar.
- [ ] **Siffran syns inte i gränssnittet.** Medvetet — en admin-vy för ett tal
      som förhoppningsvis är noll är fel investering innan datan finns. Om
      raderna börjar trilla in hör den hemma i coachingvyn, inte i en egen sida.

---

## 2026-08-20 — Radera konto: gravstenen i stället för kaskaden

Papperskorgen i admin gav `Application error … Digest: 1346789363`. Orsaken var
inte subtil: `deleteUser` gjorde ett rakt `db.user.delete`, och nio tabeller
pekar på `User` med **`ON DELETE RESTRICT`** — verifierat i tabelldefinitionerna
i Turso, inte bara i schemat, och `PRAGMA foreign_keys` är `1`. Ett enda samtal,
pass eller lista räckte för att databasen skulle vägra. I praktiken gick alltså
*inget* konto att ta bort: även Simon med noll samtal hade fem pass bakom sig.

**Klienten gjorde vägran värre.** Knappen körde `startTransition(() =>
deleteUser(u.id))` helt utan `try/catch`, så varje fel blev den generiska
kraschsidan — inklusive den vänliga texten "Du kan inte ta bort dig själv", som
alltså aldrig har visats för någon. Ett kastat fel i en server action är inte en
felhantering förrän någon fångar det.

### Valet

Tre vägar fanns, och de ger synligt olika statistik:

1. Kaskadradera historiken med personen.
2. Peka om historiken på den admin som trycker på knappen.
3. Flytta historiken till ett gravstenskonto.

Ettan raderar företagets samtalshistorik — 629 samtal hade följt med Vlado ut.
Tvåan skriver de 629 samtalen på fel namn, vilket är värre än att förlora dem:
felaktig statistik ser riktig ut. **Trean valdes.** `lib/system-user.ts` håller
kontot "Borttagen användare" på `borttagen@system.invalid` — `.invalid` är
reserverat av RFC 2606 och kan aldrig bli en riktig domän, så e-posten är en
nyckel och inte en adress. Kontot skapas först den dag någon faktiskt raderas.

Priset är medvetet och bör sägas rakt ut: **raderar du två säljare hamnar båda i
samma hink.** Vem av dem som ringde ett visst samtal går inte längre att se.
Det är avvägningen mot att inte förlora samtalet alls.

Lösenordshashen är en riktig bcrypt-hash av ett slumpat UUID ingen har sett.
Poängen är inte att den är hemlig utan att den är *välformad*: en inloggning mot
gravstenen ska svara "fel lösenord", inte kastas mot en trasig sträng.

### Det som inte är historik

- **Bolagen raderas aldrig.** `ownerId` betyder "senast bearbetad av", inte
  ägarskap — bolagen tillhör databasen, inte säljaren. De pekas om till
  gravstenen, och **claim-låset släpps**: ett bolag ska inte stå reserverat i
  sextio dagar åt någon som inte finns.
- **Parkeringarna släpps.** `leasedById` är en naken kolumn utan främmande
  nyckel, så databasen städar inte åt oss. Utan det steget hade låset pekat på
  ett id som inte fanns och bolaget legat otillgängligt tills leasen gick ut.
- **Öppna återkomster går till den som raderar**, inte till gravstenen. De är
  löften till kunder, inte historik — på gravstenen hade ingen sett dem igen.
  Avslutade återkomster följer med resten.

Ordningen i transaktionen är därför inte kosmetisk: claims letas upp på
`ownerId` och måste släppas *innan* `ownerId` byter hand, och de öppna
återkomsterna måste plockas ut innan svepet tar resten.

### Spärrar som saknades

`requireAdmin` fanns, självraderingsspärren fanns. Nytt: **sista adminen kan
inte tas bort** (annars låser du ut hela företaget), gravstenskontot kan varken
raderas eller få en roll, och adressen går inte att registrera via `createUser`.
Gravstenen döljs i admin-listan och i `getAssignableUsers` — men **inte i
statistiken**, för det är där historiken den bär ska synas.

Papperskorgen fäller numera ut en bekräftelse som räknar upp exakt vad som
händer innan den gör det. En knapp som river 629 samtal ska säga det först.

Ingen migration — inga nya kolumner. Kontrollerat i produktion före ändringen:
noll dinglande `leasedById`, noll dinglande `ownerId`, nio konton. Inget att
städa i efterhand, av det enkla skälet att ingen radering någonsin lyckats.

### Öppna punkter

- [ ] **Ingen aktivitetsrad skrivs när ett konto raderas.** Vem som raderade
      vem, och när, finns bara i minnet av den som klickade.
- [ ] **Produktknappen har samma brist som användarknappen hade.**
      `deleteProduct` körs också utan `try/catch` och utan bekräftelse.

---

## 2026-08-17 — Två säljare på samma bolag: parkeringen gick ut mitt i passet

Rapporterat från golvet: två personer ringde i dialern samtidigt och fick upp
samma bolag. Arbetslåset var inte trasigt — **det gick ut medan bolaget
fortfarande stod på skärmen.**

Räkna på det som fanns: `leaseBlockSize` är 25 och `leaseMinutes` är 15 (båda
verifierade i produktionsdatabasen). Ett block är alltså över en timmes samtal
på en parkering som dör efter en kvart. Från minut femton och framåt låg
svansen av kön olåst i databasen medan den fortfarande stod i säljarens
webbläsare, och `leaseNextLeads` — vars enda krav är `leasedUntil < now` —
serverade den vidare till nästa säljare som startade ett pass. Ingen kollision
i själva utdelningen: den är atomär och har alltid varit det. Kollisionen låg i
att kön levde längre än låset.

**Förnyelsen fanns bara som rubrik.** Intervallet i `CockpitDb` stod under
kommentaren "Leasen går ut efter en stund — förnya innan den gör det" och
anropade `refill()`. Den leasar bara *nya* bolag och rör aldrig dem som redan
ligger i kön. Förnyelse har alltså aldrig existerat i koden, bara i
kommentaren — värt att notera för nästa gång en kommentar läses som ett bevis.

**`renewLeases` i `actions/dialer.ts`** förlänger `leasedUntil` på det oringda
i kön (`leads.slice(index)`), var femte minut — en tredjedel av leasen, så två
tappade nätverksanrop i rad kostar inte kön — och direkt när fliken vaknar ur
viloläge. En dator som somnar kör inga intervall, och utan `visibilitychange`
hade första samtalet efter lunch varit det som krockade.

Det avgörande är `AND "leasedById" = ?` i satsen: bara rader jag fortfarande
äger förlängs. Har en kollega redan hunnit ta ett bolag matchar raden inte, och
id:t kommer tillbaka som **förlorat** i stället för att skrivas över.
Förnyelsen kan därför aldrig stjäla tillbaka ett bolag från någon som sitter i
samtalet, och kön i webbläsaren kan aldrig innehålla ett bolag som någon annan
äger — förlorade rader plockas bort ur `leads` direkt.

**Ett undantag: bolaget säljaren står på just nu yanks aldrig.** Svaret kan
landa i sekunden hen har kunden på tråden, och att byta skärm mitt i ett samtal
är värre än dubbelringningen som redan pågår. Det får i stället ett rött band
över bolagsrubriken med namnet på den som tagit över, och dispositionen skrivs
klart som vanligt.

`leaseMinutes` lämnades på 15. Den är inte längre ett arbetsfönster utan en
**dödmansgrepp**: dör fliken utan att `pagehide` hinner köra `releaseLeases`
frigörs bolagen efter en kvart. Höj den inte i tron att det löser något —
förnyelsen är det som håller kön, tiden är bara städningen efteråt.

Ingen migration — inga nya kolumner.

### Öppna punkter

- [x] **Ingen mätning av hur ofta det händer.** Åtgärdad 2026-08-20, se
      avsnittet överst.
- [ ] **En säljare som går på lunch med fliken öppen håller kvar 25 bolag.**
      Förnyelsen tickar vidare oavsett om någon ringer. Presence-heartbeaten vet
      redan om säljaren är aktiv (`status: "DIALING"`, var 15:e sekund) — att
      låta förnyelsen kräva ett livstecken från de senaste minuterna vore nästa
      steg om hamstringen syns i datan.
- [ ] **`leaseBlockSize` 25 är otestat mot verkligheten.** Med förnyelsen på
      plats spelar storleken mindre roll för krockar, men ett mindre block hade
      gjort fönstret där något kan gå fel mindre. Mät innan du ändrar.

---

## 2026-08-15 (senare) — Öppna i dialer: från sökträff till samtal

Sökningen kunde hitta ett bolag men inte ringa det. Vägen var bolagskort →
ringlista → starta pass → hoppas att bolaget dyker upp, och sista steget höll
inte: ett bolag med öppen återkomst, maxade försök eller aktiv affär serveras
aldrig av rotationen. Man kunde alltså se företaget på skärmen och ändå inte nå
det.

**`leaseSpecificLead` i `actions/dialer.ts`** är motsatsen till
`leaseNextLeads`. Den senare svarar på "vilket bolag står på tur"; den nya tar
bolaget någon skrev namnet på och **struntar i däckets filter**. Det är
avsiktligt — filtren avgör vad rotationen ska servera, en fråga ingen ställde
när säljaren sökte upp ett namn. I stället för att stänga dörren skickar den med
varningar som cockpiten renderar över bolagsrubriken: spärrat, spärrlista, öppen
återkomst med namn på den som lovade, aktiv affär, försök över taket, låst av
kollega, ingen kontakt med nummer.

**Ett undantag släpps inte igenom: kollegans arbetslås.** Ligger bolaget i någon
annans leasade block just nu sitter hen sannolikt i samtalet, och två säljare på
samma nummer är precis vad låset finns för. Då visas en skärm med namn och tid i
stället för cockpiten. Låset tas med samma dubbelkollande UPDATE som däcket
använder, så en kollega som hinner emellan vinner i stället för att skrivas
över.

**Cockpiten kör nu också utan mapp.** `listId` är `string | null`: ett uppslaget
bolag som inte ligger i någon ringlista säljaren kommer åt öppnas ändå, och
påfyllningen tar då ur hela det egna däcket (`leaseNextLeads(null)`, som redan
fanns). Rubriken säger "Alla mina leads" så att den tomma platsen inte läser som
ett fel.

**⌘K i cockpiten** (`components/cockpit/LeadSwitcher.tsx`) byter bolag mitt i
passet. Bolaget läggs **efter** det aktuella och blir nästa i kön — det pågående
samtalet hoppas över precis som med `s`, ingen disposition skrivs. Den viktiga
detaljen är att bytet sker i klienten och inte med en navigering till
`/cockpit?leadId=…`: en navigering hade avslutat ringsessionen och startat en
ny, vilket delat säljarens pass i två i statistiken varje gång någon slog upp
ett bolag. Att dispositionstangenterna inte fyrar medan rutan är öppen sköts av
cockpitens befintliga lyssnare, som släpper igenom allt som kommer från ett
`input` — "3" skriver en trea i sökfältet i stället för att registrera ett sålt
samtal.

Ingången finns på tre ställen: knappen i sökträffen på Ringlistor, knappen i
topplisten på `/leads/[id]`, och ⌘K inne i cockpiten.

`hydrateLeads` bröts ur `leaseNextLeads` och delas nu av båda vägarna. Det är
inte kosmetika: hade den uppslagna vägen haft en egen select hade bolaget saknat
exempelvis historiken, och skillnaden bara synts som en tom panel.

Ingen migration — inga nya kolumner.

### Öppna punkter

- [ ] **Varningarna är oräknade.** Det går inte att svara på hur ofta någon
      öppnar ett bolag med öppen återkomst, alltså inte heller på om undantaget
      används som avsett eller har blivit en genväg förbi notisklockan. En rad i
      aktivitetsloggen vid uppslag hade besvarat det.
- [ ] **Kollegans lås blockerar även den som bara vill titta.** Skärmen länkar
      till bolagskortet, men en säljare som fått kunden på tråden medan kollegan
      har bolaget uppe har ingen väg in i cockpiten alls. Om det visar sig
      hända i verkligheten är övertagande med varning nästa steg — det valdes
      bort nu för att det kan rycka undan ett pågående samtal.

---

## 2026-08-15 — Kopplingen åt rätt håll, och coachingvyn den öppnade

### Webhooken kommer alltid först

Kopplingen mellan växelsamtal och disposition gjordes bara vid mottagandet av
webhooken. Den riktningen är fel för nästan varje samtal: Lynes rapporterar i
samma ögonblick som luren läggs på, och säljaren dispositionerar sekunderna
efter. Webhooken letade alltså efter en rad som ännu inte fanns.

Mätt på 471 utgående samtal den 14 augusti:

    dispositionen skrevs EFTER webhooken kom      368
    dispositionen fanns redan när webhooken kom    13
    ingen disposition alls                         63

Trettio samtal av 508 var kopplade. `recordAttempt` letar nu upp det väntande
växelsamtalet efter att transaktionen gått igenom, och
`prisma/backfill-telephony-links.mjs` gjorde samma sak bakåt. **337 av 485 är
kopplade nu.**

**Fönstret mäts från samtalets SLUT, inte dess start.** Ett samtal i
produktionsdatan är 2 033 sekunder långt — mätt från starten hamnar
dispositionen en halvtimme bort och faller utanför varje rimligt fönster,
trots att den skrevs direkt efter påläggningen. Fördelningen från slut till
disposition: 313 inom 30 s, 41 inom två minuter, 15 längre bort. De sista
lämnas omatchade med flit; där hann säljaren ringa ett samtal till.

### RÄTTELSE: `duration` innehåller ringtiden

Den öppna punkten om `talkSec` är besvarad, och svaret är att `durationSec`
inte är samtalstid. Kopplingen avgjorde det: **obesvarade samtal har 17
sekunders median-duration**, och ett obesvarat samtal består av ingenting
annat än ringtid.

Följden är att växelns svarsfrekvens var falsk. Växeln såg 63 obesvarade
utgående den 14:e; säljarna registrerade 173. De 110 däremellan är samtal som
ringde 20–45 sekunder utan att någon svarade, och som räknades som besvarade
för att durationen var över noll. "86 % svarsfrekvens" är i verkligheten
omkring 62 %.

Coachingvyn drar därför bort ringtiden från varje längd, och räknar om
medianen vid varje anrop i stället för att hårdkoda den — ändrar växeln sin
timeout följer måttet med.

### Cockpitens `durationSec` mäter fel sak

Den mäter tiden dispositionsrutan var öppen, inte samtalet. Före kopplingen
stod det **3 sekunder** i snitt på en bokad återkomst och 5 på ett DM-nej.
Växelns siffror för samma rader: 89 respektive 108 sekunder. Backfillen skrev
in den riktiga längden där kolumnen stod på noll.

### `/coaching`

Egen sida och inte en flik i Statistik, därför att den svarar på en annan
fråga: statistiken räknar utfall ur säljarens registrering, coachingen mäter
beteende ur växelns samtal. Tre mått per säljare — andel korta samtal, dödtid
mellan samtal, taltid per timme på dagen — var och en ställd mot golvets
median.

**Jämförelsen är alltid mot medianen, aldrig mot ett uppsatt mål.** Ett mål är
en gissning; medianen är bevisligen nåbar, eftersom halva golvet redan når
den. Flaggor sätts bara vid marginal utöver medianen (10 procentenheter,
faktor 1,5, faktor 0,6) — utan marginalerna flaggas halva golvet varje dag och
listan slutar betyda något.

Första körningen mot riktig data: Josef gör flest samtal (194) men har 39 %
korta mot golvets 24 och 35 sekunders medianlängd mot golvets 60. Han ringer
mest och kommer minst in i samtalen — exakt den motsättning ingen siffra i
systemet kunde visa tidigare.

### Öppna punkter

- [ ] **Inspelningar finns inte i webhooken, och kommer inte att göra det.**
      513 payloads, alla med exakt samma åtta fält (`toNumber`, `fromNumber`,
      `duration`, `body`, `startTime`, `callType`, `userId`, `itemType`). Noll
      innehåller ordet "record". Ljudet måste hämtas ur ett Lynes-API.
      **Frågan att ställa Lynes:** finns ett REST-API för att lista och ladda
      ner inspelningar, hur autentiseras det, och vilket fält knyter en
      inspelning till ett samtal — webhooken skickar ingen samtalsidentifierare,
      bara `startTime`, `userId` och nummer.
- [ ] **148 av 485 samtal saknar fortfarande disposition.** Efter backfillen är
      det inte längre ett kopplingsfel utan verkligt bortfall: växeln såg
      samtalet, ingen sa vad det ledde till. Siffran står i coachingvyn.
- [x] **`CallAttempt.hourOfDay` och `.weekday` räknades i UTC.** Rättat samma
      dag, se avsnittet nedan.
- [ ] **`talkSec` och `waitSec` är fortfarande tomma.** De går att fylla den dag
      Lynes kan skicka en svarstidpunkt. Tills dess är ringtidsmedianen
      approximationen, och den är gemensam för alla samtal — en säljare vars
      samtal genomgående ringer längre får sin uppkopplade tid överskattad.

---

## 2026-08-15 (senare) — Timme och veckodag räknades i UTC

`recordAttempt` skrev `hourOfDay` och `weekday` med `now.getHours()` och
`now.getDay()`. Vercel kör i UTC, så varje rad bar UTC-tiden: ett samtal
klockan 09:30 svensk sommartid stod som timme 7.

Buggen bekräftades på att **alla 1 106 rader hade `hourOfDay` exakt lika med
UTC-timmen**, och rättelsen på att alla 1 106 låg exakt två timmar fel — inte
en enda avvikelse åt något håll. Ett spritt utfall hade betytt att antagandet
var fel.

`weekday` bar samma fel, fast tystare: ett samtal 00:30 natten till måndag är
söndag i UTC och hamnar i fel vecka utan att något ser konstigt ut. Ingen rad
råkade ligga där, men felet fanns.

**Rättelsen gjordes trots att ingen vy läser kolumnerna — just därför.**
Blandas två betydelser i samma kolumn går den aldrig att lita på igen, och
felet hade upptäckts först den dag någon byggde "bästa tid att ringa" ovanpå
den. `prisma/backfill-hour-weekday.mjs` räknar om ur `startedAt`, som är en
riktig tidsstämpel och därmed entydig. Idempotent — en omkörning rapporterar
noll att rätta.

Fördelningen efteråt ser ut som en arbetsdag, vilket den inte gjorde förut:

    kl 09    9
    kl 10   84
    kl 11  230
    kl 12   37     ← lunch
    kl 13  188
    kl 14  122
    kl 15  237
    kl 16  176
    kl 17   21

`hourOfDay()` och `weekdayOf()` i `src/lib/time.ts` är vägen framåt. **Använd
dem i allt som skriver eller läser tid** — `Date.getHours()` och `getDay()` är
fel i produktion varje dag på året.

---

## 2026-08-14 (senare) — Lynes skickar millisekunder, och rapporterar efteråt

Tretton riktiga leveranser räckte för att avgöra två saker som en enda inte
kunde. Mönstret som avgjorde båda:

    mottagen  startTime  duration   mottagen − startTime
    07:55:35  07:55:26   7000       9,2 s
    07:59:15  07:59:10   5000       5,7 s
    08:00:48  08:00:26   22000      22,3 s
    08:02:17  08:01:26   51000      51,6 s
    08:02:53  08:01:35   78000      78,4 s

`mottagen − startTime ≈ duration / 1000`, varje gång, inom en halv sekund.

### 1. `duration` är MILLISEKUNDER

Alla lagrade längder var 1000 gånger för stora — 78000 "sekunder" är 21
timmar. Att det inte upptäcktes direkt beror på att siffrorna såg rimliga ut
i en kolumn ingen ännu läser.

Värre: typtestet hade ett tak på 86400, satt i tron att det skulle fånga
millisekunder. Det gjorde tvärtom. Varje samtal **längre än 86,4 sekunder**
skickade en duration över taket och fick sin längd **tyst förkastad** — alltså
föll precis de samtal bort som är värda något, medan de korta blev kvar och
var fel. Taket är nu ett dygn i millisekunder, och `toSeconds` avgör enheten:
jämnt delbart med 1000, eller större än 86400, betyder millisekunder.

Kvarvarande svaghet: en längd i millisekunder som inte är jämna sekunder
(1500) läses som sekunder. Lynes skickar bara jämna tusental, så fallet är
teoretiskt.

### 2. RÄTTELSE: Lynes rapporterar EFTER samtalet, inte vid start

Anteckningen nedan drog slutsatsen att Lynes rapporterar när samtalet BÖRJAR,
utifrån att den första leveransen kom 0,7 sekunder efter sin egen `startTime`
med `duration: 0`. Det var fel, och felet var att generalisera från ett enda
fall: det samtalet var faktiskt noll sekunder långt. Ingen svarade.

Rätt tolkning: **en händelse per samtal, skickad när samtalet är slut.**
`duration: 0` betyder alltså obesvarat, inte "har inte hänt än". Statusen är
`NO_ANSWER`, inte `RINGING`.

Följdändring: sluttiden härleds nu som `startTime + duration`, eftersom Lynes
inte skickar någon. Utan den står varje samtal kvar som pågående för alltid —
och `openCallId`, som letar efter oavslutade rader, slår då ihop nästa samtal
till samma bolag med det förra.

### 3. Den syntetiska nyckeln slog ihop olika samtal

Samtals-id:t hashades på avrundad MINUT, i tron att det skulle knyta ihop
flera händelser om samma samtal. Effekten blev den motsatta: en säljare som
ringer samma bolag två gånger inom samma minut — ett omedelbart nytt försök,
det vanligaste som finns — fick båda samtalen hopslagna till EN rad. Ett
samtal i produktionsdatan hade `eventCount = 3`, alltså tre riktiga samtal
begravda i ett. Nyckeln hashas nu på exakt starttid.

### Vad rådataloggen var värd

Alla tre felen rättades utan att ett enda samtal behövde ringas om: raderna
kördes om ur `TelephonyEvent.rawJson` mot den nya tolkningen. Det var precis
det scenariot tabellen skrevs för, och det är enda anledningen till att en
felkalibrerad mottagning inte kostade en dags samtalsdata.

### Öppna punkter

- [ ] **Inspelningar finns inte i payloaden.** Tretton leveranser, noll
      `recordingUrl`. Fältet skickas alltså inte i webhooken — inspelningar
      måste hämtas ur Lynes API, eller så är de avstängda på kontot. Fråga
      Lynes vilket.
- [ ] **`talkSec` är alltid tom.** Lynes skickar en enda längd. Om `startTime`
      är när det ringde eller när det svarades är okänt — och det avgör om
      `duration` är samtalstid eller total tid. Skillnaden syns i
      svarsfrekvensen.
- [ ] **Ett nummer matchade inget bolag** (+46848001501). Väntat för samtal
      utanför ringlistorna, men värt att följa: många omatchade betyder att
      kontakternas nummer inte är normaliserade.

---

## 2026-08-14 — Lynes: den riktiga payloaden, och tre fel den avslöjade

Första äkta leveransen kom in 07:06:18 UTC. Den ser inte ut som något av
antagandena i gårdagens mottagning. Här är den ordagrant — det är den enda
dokumentation av Lynes webhook-format som finns, eftersom Lynes inte
publicerar någon:

    {
      "toNumber":   "+46XXXXXXXXX",
      "fromNumber": "+46XXXXXXXXX",
      "duration":   0,
      "body":       "Call to: +46XXXXXXXXX\nCall from user: <säljarens
                     e-post> (+46XXXXXXXXX)\nCall type: Inbound",
      "startTime":  1786691178000,
      "callType":   "Inbound",
      "userId":     "e9f59b10-64b0-43eb-bed7-f5b52337ef20",
      "itemType":   "OUTGOING_CALL"
    }

**Nyckeln kommer som `Authorization: Bearer`.** Verifierat i
`TelephonyEvent.authMethod`. Query-parametern är därför borttagen ur
`verify.ts` — en hemlighet i URL:en hamnar i proxyloggar och behövs
bevisligen inte. Bearer, egen header och HMAC står kvar.

### Tre fel som bara verkligheten kunde visa

**1. `callType` och `itemType` säger emot varandra.** `callType: "Inbound"`
står bredvid `itemType: "OUTGOING_CALL"` i samma payload. itemType är den som
stämmer: bodytexten säger "Call from user: <säljaren>", och det är `toNumber`
som tillhör bolaget. Väljs callType pekas SÄLJARENS eget nummer ut som motpart,
och samtalet matchas mot fel bolag eller inget alls. `itemType` ligger nu först
i både `DIRECTION` och `EVENT_TYPE`. Före fixen blev riktningen `null`.

**2. `duration: 0` betyder inte "ingen svarade".** Leveransen kom **0,7
sekunder efter sin egen `startTime`** — Lynes rapporterar alltså när samtalet
BÖRJAR, inte när det slutar. Att läsa nollan som obesvarat hade märkt varenda
påbörjat samtal som obesvarat: en siffra som ser rimlig ut och är systematiskt
lögnaktig. `deriveStatus` behandlar nu samtalsposter separat — nolla utan
sluttid är `RINGING`, duration över noll är `COMPLETED`.

**3. Säljaren finns bara i fritext.** Strukturerat finns bara
`userId` med ett UUID som inte betyder något hos oss. E-postadressen — det
enda som går att koppla till en `User` — ligger inne i `body`-strängen.
`emailFromFreeText` letar därför e-post i alla textvärden, men **bara om det
finns exakt en unik adress** i hela payloaden: två adresser betyder att vi
inte vet vilken som är växelanvändarens, och fel säljare på ett samtal är
värre än ingen säljare, eftersom felet inte syns.

### Lynes skickar ingen samtalsidentifierare

Ingen. Det gör att start- och sluthändelse om samma samtal hamnar på var sin
rad med halva sanningen på var sin — den ena har starttid, den andra längd och
inspelning.

`openCallId` löser det: finns redan ett **oavslutat** samtal mot samma motpart,
av samma växelanvändare, den senaste timmen — då är det samma samtal. Alla tre
villkoren behövs. Utan agenten slås två säljares samtal till samma bolag ihop,
utan `endedAt IS NULL` skrivs ett avslutat samtal över av nästa till samma
nummer, utan tidsfönstret slås gårdagens ihop med dagens. Faller det ut används
en syntetisk nyckel med prefixet `synthetic:`, så att det syns i databasen att
id:t är vår gissning.

### Vad som faktiskt fungerade direkt

Numren, tidsstämpeln (epoch i millisekunder) och **matchningen mot lead** —
`toNumber` hittade rätt bolag på `Contact.directPhoneE164` utan justering.
Rådataraden gjorde hela den här kalibreringen möjlig: felen upptäcktes genom
att jämföra `rawJson` mot `TelephonyCall`, och inget behövde ringas om.

### Fallgrop: två migrationer heter 017

`017_lynes_telefoni.sql` och `017_lasning_styrs_av_utfallet.sql` skrevs samma
dag i olika pass. Båda är applicerade och bokförda — `apply-sql.mjs` nycklar på
filnamn, inte på nummer, så ingenting går sönder. Men ordningen mellan dem är
inte längre läsbar ur numret. **Nästa migration är 018.**

### Öppna punkter

- [ ] **Vet inte om Lynes skickar en sluthändelse.** Bara startevenemanget är
      observerat. Kommer ingen andra leverans får vi aldrig samtalslängd,
      slutstatus eller inspelning — och då är `duration`, `talkSec` och
      `recordingUrl` permanent tomma. Kolla `SELECT status, count(*) FROM
      TelephonyCall GROUP BY 1` efter en dags trafik: står allt kvar på
      `RINGING` skickar Lynes bara en händelse per samtal, och då måste
      resten hämtas ur deras API i stället.
- [ ] **`callType` är fortfarande oförklarad.** "Inbound" på ett utgående
      samtal betyder troligen benet in mot växeln, men det är en gissning.
      Fråga Lynes innan fältet används till något.
- [ ] **Inspelningar har aldrig setts.** Inget `recordingUrl` i den observerade
      payloaden. Antingen skickas de i sluthändelsen, eller så måste de hämtas
      separat.
- [ ] Kvarstår från gårdagen: ingen vy för inspelningar, ingen vy för okopplade
      växelanvändare, ingen gallring av `TelephonyEvent`.

---

## 2026-08-13 — Bolaget ut ur däcket, låset till utfallet

Migration 017. Fortsättning samma dag på passet nedanför, efter två
observationer från golvet.

### 1. Ett lovat bolag ligger utanför däcket — för alla

Först reserverades bolaget för den som lovade. Det räckte inte: ett lovat samtal
är inte ett slumpmässigt nästa lead, och att servera det som ett sådant — även
till rätt person — betyder att det kommer upp mitt i en blockning, utan att
säljaren vet att det är löftet hen håller på att ringa.

`leaseNextLeads` filtrerar nu bort varje bolag som har en `PENDING` återkomst.
Ingen får det serverat av rotationen: inte kollegan, inte löftesgivaren, inte en
admin. Vägen till samtalet är notisklockan, där raden bär nummer, anteckning och
utsatt tid.

Det tvingade fram en ny yta. Ligger bolaget utanför cockpiten måste utfallet gå
att registrera någon annanstans, annars vore filtret bara ett sätt att gömma
bolaget: **`CallbackDisposition`**, en dispositionsruta i klockan. Den använder
samma `cockpit-flow`, `DispositionBar`, `CallbackForm`, `FrameworkTap` och
`RegisterDealModal` som cockpiten — inte en kortare variant, eftersom två flöden
som skiljer sig i ett steg ger ojämförbar statistik och två uppsättningar
tangenter att lära sig.

`answeredCallbackId` följer med dispositionen och pekar ut raden samtalet
svarade på. Utan den hade en säljare som ringer tio minuter före utsatt tid fått
löftet kvar i klockan resten av veckan — jämförelsen mot klockan kan inte skilja
"jag ringde löftet" från "jag råkade ringa bolaget". Id:t verifieras mot lead
och säljare i `recordAttempt`.

### 2. Låset styrs av utfallet, inte av att någon ringde

`Lead.claimedAt` sattes vid varje disposition. Ett "svarar ej" band därmed upp
ett bolag i 60 dagar (`CLAIM_TTL_DAYS`) lika hårt som ett avslut. I produktionen:

    låsta, ej pensionerade leads                       590
      senaste utfall CALLBACK_BOOKED (befogat)          45
      senaste utfall DM_NO                             164
      inget utfall alls (svarar ej/upptaget/rb)        362
      växelutfall och fel beslutsfattare                19

545 bolag låg alltså låsta utan att någon relation fanns att skydda. `claimsLead`
i `scheduler.ts` avgör nu: `CALLBACK_BOOKED` och `SOLD` låser, allt annat
släpper. Den **senaste** dispositionen bestämmer — annars låser ett bokat samtal
bolaget kvar två månader efter att samma säljare fått ett nej på det. Migration
017 släppte de felaktiga låsen; kvar är 54, varav 45 med öppen återkomst.

### Buggen testet hittade

Utfallsreglerna testades uttömmande (`computeNext` är ren och tar ingen databas)
och en sats föll: **växelns besked om när beslutsfattaren är tillbaka flyttades
av passrotationen.** `pickNextSlot` letar efter ett pass som *börjar* efter
tidpunkten och kastade därmed bort passet som faktiskt innehöll den — "han är
tillbaka nio" bokades in till tretton, eftersom förmiddagspasset börjar 08:00
och alltså inte är "efter 09:00". Hela poängen med den grenen är att växelns
besked väger tyngre än rotationen. Lagat med `slotAt` före `pickNextSlot`.

Fem andra avvikelser i testet var felaktiga förväntningar från min sida:
väntetiden per resultat är ett **golv**, inte ett klockslag. Träffar den ett
pass som redan provats skjuts försöket till nästa oprövade pass, så "+1 timme"
från 10:00 landar på 13:00. Det är passrotationen och den är avsiktlig.

### Öppna punkter

- [ ] **Testerna är inte incheckade.** `computeNext` täcks nu av 77 kontroller,
      men de kördes ur en fil i scratchpad mot en handkompilerad `scheduler.js`.
      Repot har ingen testlöpare och inget `npm test`. Nästa gång reglerna rörs
      finns inget skyddsnät om ingen skriver om filen.
- [ ] **Återkomster längre bort än 7 dagar syns ingenstans.** Klockans horisont
      är `HORIZON_DAYS = 7`, och bolaget ligger utanför däcket. En återkomst
      bokad tre veckor fram är alltså osynlig i två veckor. Den dyker upp i tid
      och inget är förlorat, men det finns ingen vy som svarar på "vad har jag
      lovat framåt".
- [ ] **Ingen överlämning när en säljare slutar.** Reservationen är permanent,
      så bolagen bakom en avslutad säljares öppna återkomster går bara tillbaka
      till golvet om en admin avbokar dem — en och en, i klockans golvvy.

---

## 2026-08-13 — Löftet tillhör den som gav det

Migration 016. Rapporterat som "återkomsten försvinner ur notiserna när tiden
går ut". Den försvann inte av tiden — den stängdes av någon annan.

### Vad som faktiskt hände

`recordAttempt` stängde **alla** öppna återkomster på leadet vid varje samtal,
oavsett vem som lovat och oavsett om tiden var inne. Det stod som ett medvetet
val i CLAUDE.md ("ett löfte är infriat när vi faktiskt ringde bolaget") och
såg oskyldigt ut ända tills det parades ihop med lease-frågan:

    ORDER BY CASE WHEN l."callbackAt" <= now THEN 0 ELSE 1 END, ...

I sekunden en återkomst förföll blev leadet leasbart igen och sorterades
**överst i däcket hos hela golvet**. Första kollega som dispositionerade
bolaget stängde löftet. Säljaren som gav det såg raden försvinna ur klockan
utan att ha ringt — och utan att något i gränssnittet sa varför.

Räknat i produktionsdatabasen innan fixen:

    stängda återkomster totalt                          9
      stängda av en ANNAN säljare än den som lovade     8
      stängda FÖRE den utsatta tiden                    7

Det är alltså inte ett kantfall. Nio av nio rader hade passerat mekanismen och
åtta av dem var fel.

### Regeln nu

En återkomst lämnar klockan på **två** sätt: den ringdes av säljaren som lovade,
eller den avbokades. Tiden är inte ett tredje sätt.

- `recordAttempt` stänger bara den ringande säljarens **egna, förfallna** rader.
  Bokar hen en ny stängs alla hens på bolaget oavsett tid. Terminalt utfall
  (sålt, fel nummer, ogiltigt nummer) stänger allas — inget kvar att ringa om.
- `leaseNextLeads` **reserverar bolaget för den som lovade, utan tidsgräns.**
  Så länge återkomsten är `PENDING` serveras bolaget aldrig till någon annan.
  Här låg först ett släpp efter 14 dagar, som skydd mot att en säljare som
  slutat låser bolag för alltid. Det togs bort samma dag: ett bolag som
  självmant hoppar tillbaka i ringlistan efter två veckor är exakt den tysta
  mekanismen hela passet handlade om, bara långsammare. Utvägen är i stället
  aktiv — en admin ser hela golvets återkomster i klockan (`scope: "floor"`)
  och kan avboka vems rad som helst, vilket lägger tillbaka leadet i rotationen.
- Klockans 30-dagarsgolv för missade är borta. Det gjorde samma sak som buggen,
  bara långsammare: lät ett löfte försvinna av sig självt.

### Fallgropen som kom med fixen

Stänger dispositionen inte längre alla rader kan en öppen återkomst finnas kvar
som `computeNext` inte vet om. Skrivs då `Lead.callbackAt = null` ligger löftet
kvar i klockan medan bolaget aldrig serveras i cockpiten — värre än buggen som
lagades. Därför skriver `recordAttempt` om ekot från den tidigaste kvarvarande
raden efter transaktionen. **Rör man den ena kolumnen måste man röra den andra**,
och det gäller nu på tre ställen: `syncLeadFromCallbacks`, `recordAttempt` och
migration 016.

### Öppna punkter

- [ ] **Reservationen syns inte i gränssnittet.** Ett bolag som är låst till en
      kollegas löfte försvinner bara tyst ur däcket. Det är rätt beteende men
      oförklarat — en admin som undrar var ett lead tog vägen har ingen vy som
      svarar. Chefsvyn (`scope: "floor"` i klockan) är det närmaste som finns.
- [ ] **Ingen överlämning när en säljare slutar.** Reservationen är permanent,
      så bolagen bakom en avslutad säljares öppna återkomster går bara tillbaka
      till golvet om en admin avbokar dem — en och en, i klockans golvvy. Det
      finns ingen "flytta alla återkomster från A till B". Med fem säljare är
      det ett kvartsjobb; med tjugo är det en funktion som saknas.
- [ ] **Ingen räknare på missade per säljare.** Med golvet borta kan en säljare
      samla på sig missade återkomster i all oändlighet utan att någon ser det.
      Statistiken mäter samtal, inte hållna löften.

---

## 2026-08-13 — Pipelinen bort, Deals in

Frågan som startade passet: "vi jobbar one call close, varför finns det en
pipeline?". Svaret var att ingen tagit bort den.

### Vad som faktiskt fanns

CLAUDE.md sa redan "verksamheten är one call close", och mötesbokningen togs
bort i migration 007. Ändå bar `Deal` hela prognosmaskineriet: ett
**obligatoriskt** `stageId` mot `PipelineStage`, vars steg hette "Möte bokat",
"Demo" och "Offert" — funktioner som inte finns — plus `probability` och
`expectedCloseAt`.

Kanbanbrädet på `/pipeline` hade därför i praktiken en kolumn med innehåll och
fyra tomma, och registreringsrutan frågade om fem saker varav tre var
meningslösa: vilket steg affären låg i, hur sannolik den var (reglage, 0–100 %)
och när den förväntades stängas — på en affär som redan var stängd.

Två vägar ledde dit och de kände inte till varandra. Dispositionen `3 Såld`
skrev ett `CallAttempt` med `outcome = SOLD` och gick vidare till nästa lead.
En separat **Deal**-knapp uppe i hörnet öppnade rutan. Inget band ihop dem:
statistikens "sålt" räknade dispositioner, `/pipeline` räknade knapptryck, och
en säljare som tryckte 3 och gick vidare hade sålt utan att någon kund fanns i
systemet.

### Vad som byggdes

**`/deals` ersätter `/pipeline`.** En lista, inte ett bräde: sorterad på
avslutsdatum, sökbar på bolag, person, ort och org.nr. Ett bräde med kolumner
beskriver arbete som rör sig genom stadier, och det finns inga stadier här.
`/deals/[id]` är kunden — belopp, kontaktuppgifter, anteckning och hela
samtalshistoriken. Historiken är `LeadHistory` rakt av från cockpiten;
samtalen ligger kvar på leadet, affären pekar bara på samma bolag.

**Registreringen sitter i dispositionen.** `3 Såld` öppnar rutan direkt, och
Deal-knappen är borta. Samtalet skrivs **först när affären är sparad** — det
är hela poängen med ordningen. Skrevs dispositionen först skulle "Avbryt" bli
en tyst datafalsk: ett sålt samtal i statistiken utan kund bakom. Avbryt tar
en tillbaka till utfallsknapparna och skriver ingenting.

**Fem fält, två obligatoriska.** Kontaktperson och ordervärde krävs;
e-post, telefon och anteckning är frivilliga. En säljare som inte fick
e-postadressen ska inte behöva hitta på en för att kunna bokföra sitt sälj.
Fokus hamnar i beloppsfältet — namnet är förifyllt från kontakten i luren.

**Ett belopp i stället för två.** `oneTimeValue` och `arrValue` slogs ihop till
`value` + `valueType` (`ONE_TIME` | `MONTHLY`). Två kolumner där bara en får
vara ifylld är en bugg som väntar. `ARR` blev `MONTHLY` för att säljaren säger
"2 900 i månaden", inte "34 800 i ARR". Statistiken summerar de två typerna
var för sig och slår aldrig ihop dem till ett tal.

**Kontaktuppgifterna kopieras till affären** i stället för att pekas ut med en
`contactId`. Kontakten kan bytas eller tas bort på leadet; vem som skrev på ska
stå kvar precis som det stod.

**Statistikens "Forecasting" blev "Affärer".** Tratten ritade fem stadier och
"stadium-till-stadium-konvertering" mellan kolumner som ingen passerade.
Nu: antal affärer, engångsvärde, månadsvärde och de senaste avsluten.
Konverteringen mäts i Aktivitet, där den hör hemma.

### Fallgropar

**`ALTER TABLE DROP COLUMN` går inte på `stageId`.** Kolumnen sitter i en
FOREIGN KEY-klausul i tabelldefinitionen och SQLite vägrar släppa den.
Migration 015 bygger om tabellen i stället, samma mönster som 002. `PRAGMA
foreign_keys=OFF` krävs för att `DROP TABLE "Deal"` inte ska kaskadradera
`DealProduct` — pragmat är verkningslöst inuti en transaktion, men
`apply-sql.mjs` kör med `executeMultiple()` som inte lindar in filen i någon.

**Enumvärden går att ta bort ur schemat, men inte ur databasen.** `OPEN`
försvann ur `DealStatus`, och Prisma kastar på en rad som fortfarande bär det.
Migrationen skriver därför om alla OPEN-rader till WON. Det är ett
tolkningsbeslut: registreringsrutan var enda vägen att bokföra ett sälj och
satte alltid OPEN, så en OPEN-rad betyder "någon sålde", inte "affär under
förhandling". Att kasta dem hade raderat säljhistorik.

`ActivityType.DEAL_STAGE_CHANGE` fick motsatt behandling — värdet står kvar i
enumet men skrivs aldrig. Aktivitetsloggen är oföränderlig och de raderna finns.

**Modalen måste stoppa tangenter från att nå cockpiten.** Cockpitens lyssnare
sitter på `window` och hoppar bara över `input` och `textarea`. Engång/Per
månad-växeln är `<button>` — med fokus där hade en 3:a dispositionerat samtalet
under den öppna rutan. Rutans yttre div gör `stopPropagation()` på keydown.

**`hasActiveDeal` är fortfarande gatet mot dialern**, inte `retired`. Villkoret
`l."hasActiveDeal" = 0` i lease-frågan är det som håller kunder utanför kön.
`cancelDeal` nollställer det igen om ingen annan vunnen affär finns kvar.

### Öppna punkter

- [ ] **`@dnd-kit/core`, `/sortable` och `/utilities` är oanvända.** Kanban var
      enda stället de fanns. De ligger kvar i `package.json` med flit: att ta
      bort dem utan att köra om `npm install` ger en `package-lock.json` som
      inte matchar, och Vercels `npm ci` avbryter på det. Rensa dem i ett pass
      där låsfilen kan uppdateras samtidigt.
- [ ] **`Product` / `DealProduct` är frånkopplade.** Produktkatalogen finns
      kvar under Admin och tabellerna är orörda, men registreringsrutan skapar
      inga radposter längre — kunden valde ett enda ordervärde. Antingen får
      produktraderna tillbaka en ingång eller så ska de bort; just nu är de en
      admin-flik som inte påverkar något.
- [ ] **`/` redirectar till `/leads`, som redirectar till `/lists`.** Två hopp
      vid varje inloggning. Fanns före det här passet, orört.
- [ ] **Ingen väg att registrera en affär i efterhand.** Rutan öppnas bara ur
      dispositionen. Missar säljaren den finns ingen knapp någonstans som
      skapar en affär på ett befintligt lead. `closedAt` är redan skild från
      `createdAt` för att bära ett efterhandsdatum den dagen ingången byggs.

---

## 2026-08-12 — Återkomster: notisfält, mejlpåminnelse och tre tysta buggar

Frågan som startade passet var "vad händer egentligen när man lägger en
återkomst?". Svaret var: mindre än någon trodde.

### Vad som faktiskt hände före det här passet

Säljaren tryckte 6 → 2, fick ett ensamt `datetime-local`, och tiden skrevs till
`Lead.callbackAt`. `computeNext` lät återkomsten vinna över rotationen och satte
`nextActionAt` till samma tidpunkt. Sedan **hände ingenting alls**.

Ingen `Activity`-rad. Ingen notis. Inget mejl. `callbackAt` renderades på exakt
ett ställe i hela appen — en badge inne i cockpiten, synlig först när leadet
redan råkat serveras. Enda vägen tillbaka till löftet var att säljaren öppnade
cockpiten i rätt ringlista efter att tiden passerat. Gjorde hen inte det var
återkomsten borta, utan spår.

### Tre buggar som låg under

**Taket åt upp lovade återkomster.** `leaseNextLeads` filtrerar på
`attemptCount < maxAttempts`. Bokningen räknar upp `attemptCount` som vilket
samtal som helst, så ett lead som bokade återkomst på försök 8 (taket) blev
**aldrig serverat igen**. Löftet försvann permanent. Villkoret har nu ett
undantag för leads med förfallen `callbackAt` — taket finns för att hindra att
vi ringer folk i onödan, inte för att hindra oss från att ringa när någon bett
oss göra det.

**Återkomsten visste inte vem som lovat.** Påminnelsen måste gå till personen
som sa "jag hör av mig på torsdag", och `Lead.ownerId` byter hand vid varje
disposition. `Callback.sellerId` sätts vid bokningen och rör sig aldrig.

**Ingenting gick att mäta.** `callbackAt` skrevs över av nästa bokning. Frågan
"hur många lovade återkomster ringde vi faktiskt upp?" hade ingen datakälla.

### Vad som byggdes

**`Callback` (migration 014)** — egen tabell. `Lead.callbackAt` finns kvar och
skrivs fortfarande, men är nu ett denormaliserat eko av den öppna raden, inte
sanningen. Sex befintliga återkomster backfillades. Bokningen sker i
`recordAttempt`, i samma transaktion som samtalet, och stänger leadets tidigare
öppna löften **före** den nya raden skapas — annars stänger satsen omedelbart
den återkomst som just bokades.

*Missad är inget lagrat status.* Det är `PENDING` med en tid som passerat. Ett
lagrat värde hade krävt ett jobb som vänder rader vid rätt minut, och den
minuten blir fel varje gång jobbet inte körs.

**Notisklockan i sidebaren.** Överst, ovanför navigeringen, med en avgränsning
under — den är inte en plats man går till, den är något som händer. Räknaren
visar bara det som kräver handling: missade plus de inom fem minuter. Räknas
allt kommande blir siffran trettio på en måndag och slutar betyda något.
Femminutersgränsen räknas mot en lokal klocka som tickar var tionde sekund;
att fråga servern så ofta hade varit polling för ingenting. Panelen är
`position: fixed` och inte en portal — sidebarens `overflow: hidden` klipper
inte fixerade lager så länge ingen förfader har `transform`, och det har ingen
i kedjan. Admin kan växla till Golvet och se allas.

**Mejlpåminnelse per återkomst.** En kryssruta i bokningsrutan, **urbockad som
förval**. Morgonmejlet 06:00 UTC mån–fre tar bara med ikryssade rader. Har man
inga den dagen skickas ingenting — ett tomt mejl är brus, och en påminnelse som
kommer på allt slutar läsas inom en vecka. Ingen bekräftelse skickas vid
bokning; det var ett uttryckligt val.

Missade rader mejlas om varje morgon tills de ringts eller avbokats. Det är
avsikten: ett brutet löfte ska fortsätta göra ont. Skyddet mot dubbelutskick är
`emailSentAt` jämfört mot dagens datum.

**Bokningsrutan** fick fyra snabbval (som hoppar över helgen), en anteckning
som följer med in i både notis och mejl, och validering mot dåtid. Den gamla
rutan accepterade gårdagens datum och skapade återkomster som förföll i samma
sekund de skrevs.

### Fallgropar

**Räkna aldrig dygn i UTC.** Vercel kör i UTC. En återkomst bokad 22:30 svensk
tid ligger på nästa datum där, och hade hamnat i fel morgonmejl — sällan,
systematiskt, och alltid på kvällsbokningarna. `src/lib/time.ts` har
`startOfDay`, `endOfDay` och `isSameDay` för Europe/Stockholm. Offseten läses ur
`Intl` i stället för att hårdkodas, och midnatt räknas i två varv så att
skiftesdygnen blir rätt.

**Cron körs i UTC, alltid.** `0 6 * * 1-5` är 08:00 svensk sommartid och 07:00
vintertid. Tiden är vald så att mejlet aldrig landar före sju lokalt — en daglig
cron kan inte kompensera för sommartid, så man får välja vilket håll felet ska
luta åt.

**`react-dom` har inga typer i projektet.** `@types/react-dom` finns inte som
dependency. Första utkastet använde `createPortal` och föll på det i
typkontrollen. Lösningen blev att inte behöva portalen alls.

**tsconfig siktar på es5.** `for...of` över en `Map` kräver
`downlevelIteration`, som inte är påslaget. `Array.from(map.values())` fungerar.

### Samma pass: anteckningar, lead-listan och söket

**Cockpit-anteckningen var skrivskyddad data.** Textarean "Anteckning — sparas
med samtalet" skrev till `CallAttempt.note`, och `CallAttempt.note` renderades
inte på ett enda ställe i appen. Lead-sidan visar bara `Activity`-rader, och
`recordAttempt` skrev ingen. En säljare som skrev "vill ha offert efter
semestern" förlorade det permanent. Två åtgärder: `recordAttempt` skriver nu en
`Activity` när det finns en anteckning (bara då — en rad per samtal hade lagt
150 rader per säljare och dag i loggen), och cockpiten fick `LeadHistory`.

Panelen är hopfälld med flit: en rad per händelse med bara tid och utfall,
anteckningen fälls ut vid klick. Rader utan anteckning saknar pil, så det syns
på en tiondels sekund var det finns text att läsa. Samtal och lead-sidans
anteckningar ligger i samma tidslinje — säljaren bryr sig om vad som sagts om
bolaget, inte om i vilken vy det skrevs.

**Lead-listan är avvecklad.** `/leads` redirectar till `/lists` och ligger inte
i menyn. Den var en parallell ingång till samma bolag som redan ligger i en
ringlista. `/leads/[id]` är orörd — allt länkar dit, och en radering hade krävt
en ersättare först.

Redirect och inte 404: `/leads` finns i bokmärken, i `revalidatePath`-anrop och
i länkar som skickats mellan säljare.

**Söket flyttade till Ringlistor.** Fältet filtrerade tidigare bara mappnamn i
klienten. Nu söker det också leads mot servern, med 250 ms fördröjning — en
fråga per tangenttryckning mot flera tusen rader är belastning för ett resultat
som hinner bytas ut innan någon läst det. Sökningen tar med `hasActiveDeal` och
retirerade leads, till skillnad från gamla `getLeads`: "varför ringer vi inte
det här bolaget?" är en fråga söket ska svara på, inte dölja. Telefonnummer
normaliseras till siffror så att "070-123 45 67" hittar "+46701234567".

Ett kapplöpningsskydd behövdes: utan `cancelled`-flaggan i `useEffect` skriver
ett långsamt svar på en gammal sökning över ett nyare, och listan blinkar
tillbaka till förra bokstavens träffar.

### Öppna punkter

- [ ] **`RESEND_API_KEY` och `EMAIL_FROM` är inte satta i Vercel.** Utan dem
      svarar morgonjobbet `skipped` och skickar ingenting — allt annat i
      återkomsterna fungerar ändå. Domänen måste verifieras i Resend (SPF +
      DKIM) innan utskick från `@clicknet.se` går igenom; utan verifierad domän
      svarar API:et 403.
- [ ] **Ingen dedikerad sida för återkomster.** Klockan räcker för dagens
      arbete men ger ingen veckoöverblick och ingen väg att flytta många på en
      gång. Medvetet bortvalt tills det efterfrågas.
- [ ] **`Callback` skriver ingen `Activity`-rad.** Aktivitetsloggen på leadet
      nämner fortfarande inte att en återkomst bokats eller avbokats. Loggen är
      oföränderlig och append-only, så det är billigt att lägga till — men det
      är två skrivningar till per disposition och togs inte i det här passet.
- [ ] **Statistikvyn visar fortfarande dödtid i sekunder.** `SettingsView` fick
      minuter över en minut (`formatIdle`); `stats/StatsView.tsx` har samma
      `{avgIdlePerCall}s` på två ställen och lämnades orörd eftersom det är en
      tabellkolumn där fast enhet gör jämförelsen enklare.

---

## 2026-08-09 — Designsystem: elevation, tokens, och 4 300 rader död kod

Utgångspunkten var att gränssnittet kändes "för lätt och för grått för ett
företagssystem". Det var inte smak — det fanns tre mätbara orsaker.

**Accentfärgen var svart.** `--accent: #1A1A18`. Clicknet-grönt stod i README
men användes inte i en enda variabel. Allt var gråskala plus fyra statusfärger.

**Skuggorna bar ingen information.** Kort, knappar, tabs och statmoduler hade
alla `--shadow-sm`. När allt är lyft är inget lyft. Dessutom fanns två
parallella skuggsystem: `--shadow-xs..xl` i CSS och `elevation-1..4` plus
`glow-*` i Tailwind, där det senare var byggt för mörkt läge
(`rgba(0,0,0,0.5)`) men kördes på vit bakgrund. `shadow-button`,
`shadow-glow-sm/md/lg` användes i komponenterna men fanns inte i configen —
de renderade ingenting alls.

**Lagerkontrasten var ~2%.** `#F8F8F7` botten mot `#FFFFFF` yta. Ögat läser det
som en enda platt yta. Nu är det ~4% (`#F1F3F6`), och det ensamt gjorde mest.

### Det stora fyndet: tio komponenter var inte kopplade till något

`CockpitView` (1 206 rader), `DashboardView`, `ListsView`, `ListView`,
`ImportView`, `Sidebar`, `SettingsView`, `ResearchView`, `MappingView` och
`StatsView` i roten refererades av **ingen route** — bara av trädskissen i
README. Cirka 4 300 rader. Där låg också samtliga nio gradientknappar
(`from-clicknet-accent via-pink-500 to-clicknet-violet`), alla trasiga
`shadow-glow`-klasser och 211 av 1 011 inline-stilar.

De är raderade. Det var billigare än att koda om dem, och utan raderingen hade
designsystemet fått gälla kod som ingen ser. Den levande appen består av 34
komponenter. **`stats/StatsView.tsx` är den riktiga statistikvyn**, inte
`StatsView.tsx` i roten som nu är borta.

### Vad som gäller nu

Doktrinen står överst i `src/app/globals.css` och reglerna i `CLAUDE.md`, som
skrevs om helt — det gamla avsnittet föreskrev "Sophisticated Glassmorphism",
serif-rubriker och `border-radius: 22px`, alltså raka motsatsen.

Fem elevationsnivåer, `--shadow-0` till `--shadow-4`. Kort ligger på 0,
dropdowns på 2, modaler på 3, drag och toast på 4. Alla skuggor är lagrade i
tre steg och kalltonade `rgba(16, 24, 40, …)` — aldrig ren svart. Tailwinds
`shadow-sm/md/lg/xl` är ompekade till samma skala så en klass inte kan smita
förbi den.

Radien gick från tretton hårdkodade värden (3–22px, 208 förekomster) till fyra
tokens: 6 / 10 / 14 / full.

Accenten är `#0B7F6E`. Clicknet-grönt `#3DD68C` ger 1,7:1 mot vitt och duger
inte till knappyta eller text; den ljusa valören finns kvar i `--accent-bright`.
Text på färgad yta använder `--on-accent` och `--on-danger`, som vänder med
temat — vit text på ljusröd yta gav 2,6:1 i mörkt läge.

Instrument Serif är borta. **Inter** bär gränssnittet och tabellerna,
**Space Grotesk** bär h1–h3 och stora mätvärden. Space Grotesk i 13px
tabellceller var bred och svårläst, och det är där säljaren tillbringar dagen.

Glassmorphism-blocket i CSS var död kod och de två kvarvarande inline-
användningarna satt på kort som inte svävar — båda är vanliga ytor nu.
`prefers-reduced-motion` respekteras. Fokusringen är en enda regel i accentfärg,
via `box-shadow` så den inte klipps av `overflow: hidden`.

### Två UX-ändringar

**Sidebaren är expanderbar.** 56px → 216px, breddar sig vid hover och kan
pinnas. Pinningen ligger i `localStorage` under `saleshub.sidebar.pinned` —
det rör bara den datorn och är inte värt en serverrundtur. Opinnad skena
lägger sig **ovanpå** innehållet vid hover i stället för att skjuta det.

**Dödtidsmätaren i cockpit-headern.** `idleSeconds` fanns redan men visades som
en siffra som skiftade till gult vid 120s. Nu är den en `PaceMeter`: tid sedan
förra dispositionen, samtal per timme, och en stapel som fylls mot tre minuter.
Färgen eskalerar vid 45 / 90 / 180 sekunder. Samtal/timme visas först efter fem
minuter — dessförinnan är nämnaren så liten att talet studsar mellan 0 och 300.

### Fallgropar

**Ingen av CSS-komponentklasserna användes.** `.card`, `.btn-primary`,
`.stat-module`, `.nav-rail` — varenda användning låg i de döda filerna. Den
levande appen är byggd på 800 inline-stilar mot `var(--)`. Det är också
räddningen: eftersom de pekar på tokens slog nya värden igenom överallt utan
att komponenterna rördes. Klasserna finns nu och är verifierade, men de
levande vyerna är ännu inte konverterade till dem. Det är nästa steg och det
är rent hantverk, ingen risk.

**Zsh ordsplittar inte `$(...)` i en for-loop.** Första codemod-körningen
skickade hela fillistan som ett enda filnamn. Använd `| tr '\n' '\0' | xargs -0`.

### Öppna punkter från det här passet

- [ ] **`/research` i sidebarens meny leder till 404.** Det finns ingen
      `src/app/research/`. Routen har funnits — `.next/types` bar kvar en
      referens — men är borttagen. Länken ligger kvar orörd: antingen ska
      vyn tillbaka eller så ska raden bort ur `NAV` i `AppSidebar.tsx`.
      Beslutet är produktens, inte designsystemets.
- [ ] **800 inline-stilar kvar i levande komponenter.** De fungerar och pekar
      rätt, men varje ny yta som skrivs för hand är en yta som kan glida.
      Konvertera vy för vy till `.card` / `.panel` / `.menu` / `.modal` / `.btn-*`.
- [ ] **Ingen inloggad vy är visuellt granskad.** Verifieringen gjordes mot
      `/login` och en tillfällig förhandsvisning som renderade sidebaren och
      komponentklasserna med påhittad data. Den är raderad. Cockpit, pipeline
      och leaddetaljen är sedda i kod men inte i drift.

---

## 2026-08-08 — Läget efter importen

    leads totalt                          9 094   (var 3 426)
      med hemsida                         8 066
      med ort                             9 086
      med bransch                         6 599
      RANKBARA                            7 018   (var 18)
      utan kontakt, alltså oringbara          0

    seo.rank                              5 711
      varav faktisk placering               854
      varav syns inte på sitt sökord      4 857   ← de säljbara
    gmb.reviewCount                       5 878
    gmb.category                          5 760
    gmb.rating                            5 176

5 668 bolag importerade ur `berikade_leads_ENDAST_NYA.csv` med
`scripts/import-enriched.ts`, 38 708 SEO-uppgifter, noll krediter, noll
krockar med befintliga leads.

Rankmätningen på ringlista `b50c921f` är påbörjad men INTE klar: 39 av 376
segment, mätt till 2,7 krediter per segment. Resten kostar ~910 krediter.
Ungefär 1 500 av 2 500 gratiskrediter förbrukade, varav 445 på kvittobuggen.

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

### Antagandet att Googles kategorier skulle täta segmenten var FEL

Gissningen var att `gmb.category` är mer standardiserad än ordlistans termer
och därför skulle ge färre och större segment. Mätt efter att alla 562 leads på
ringlistan slagits upp:

    376 segment för 391 leads  =  1,04 leads per sökning

Kategorierna splittrar i stället för att täta, och orsaken är inte kategorierna
utan **orten**. Beståndet ligger i småorter — Limhamn, Rimbo, Svedala — där en
ort ofta har ett enda bolag i sin kategori. Segmentdelningen bär bara frukt när
många bolag delar både yrke och ort, alltså i storstäderna.

Slutsats: för det här beståndet är segmentspåret ungefär lika dyrt som ett
uppslag per bolag. Det är inte ett fel i koden utan en egenskap hos datan, och
den ska man känna till innan man budgeterar.

### Segmentet ska inte betala för Maps-rutan två gånger

`runSerper` anropade `/places` per segment även när varje bolag i segmentet
redan slagits upp enskilt. Den datan är då redan hämtad — och hämtad med bättre
träffsäkerhet, eftersom uppslaget gällde just det bolaget i stället för
segmentets topplista. 376 krediter på ringlistan som inte behövde spenderas.
Hoppas nu över när alla i segmentet har ett `gmb.lookup`-kvitto.

### Vercels 300-sekundersgräns dödade körningarna tyst

Uppslagen görs ett i taget och tar drygt en sekund styck, så `limit=300` slog i
taket. Funktionen dödades mitt i: skrivningarna fanns kvar men svaret försvann,
och det gick inte att se hur långt den kom. `lookupLeads` har nu en tidsspärr
på 260 sekunder och rapporterar att den stannade själv.

### Import från skal: `scripts/import-enriched.ts`

Gränssnittets import kräver en inloggad admin-session och går inte att köra
från ett skal. Skriptet återanvänder samma moduler som `/api/import-stream` —
`toE164`, `resolveIndustry`, `signalsFromImport`, `writeImportedClaims` —
i stället för att skriva om reglerna. En kopia av importlogiken hade blivit
den tredje importvägen, och det är precis fällan den här loggen varnar för.

**Skriptet SKAPAR bara, det slår aldrig ihop.** Det stannar med felkod om något
org-nummer redan finns. Filen måste därför filtreras först: importen
deduplicerar på org-nummer och 44 % av raderna saknar sådant, så en ofiltrerad
fil ger dubbletter av allt som bara matchar på namn.

**Kontakterna heter numera bolaget, inte "Mobil".** Den tidigare importen
pekade "Kontaktnamn" på `nummertyp`-kolumnen, så samtliga kontakter i databasen
heter "Mobil" eller "Fast". Skriptet sätter bolagsnamnet som kontaktnamn och
nummertypen som roll — samma information, läsbar på skärmen. Mobilnummer läggs
på `directPhone`, fasta nummer på `switchboard`, eftersom ett fast nummer i
praktiken är en växel. De gamla kontakterna är orörda; vill man rätta dem
behövs en egen backfill.

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
