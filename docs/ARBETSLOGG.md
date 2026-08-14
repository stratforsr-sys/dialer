# Arbetslogg

Beslut, fallgropar och öppna punkter som **inte** går att läsa sig till ur koden.
Commit-meddelandena bär detaljerna — den här filen bär sammanhanget och det som
är kvar att göra.

Nyast först.

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
