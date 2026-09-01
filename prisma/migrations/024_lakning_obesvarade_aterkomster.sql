-- 024_lakning_obesvarade_aterkomster
--
-- Lagar löftena som `recordAttempt` stängde utan att de infriats. Koden är
-- rättad i samma commit (regel 4 i återkomstavsnittet); det här är städningen
-- efter den.
--
-- ## Vad som hände
--
-- Dispositionen stängde säljarens egna förfallna återkomster på varje samtal,
-- med motiveringen "tiden var inne och jag ringde — det är exakt vad raden bad
-- om". Men *ringde* är inte *nådde fram*. Ett `NO_ANSWER` på en förfallen
-- återkomst markerade löftet som COMPLETED, och därifrån föll bolaget rakt ut
-- i golvet:
--
--   * raden försvann ur klockan och ur chefsvyn — löftesgivaren hade inget
--     kvar som påminde om att ringa igen,
--   * `claimedAt` nollades i samma skrivning, eftersom `claimsLead` bara ser
--     utfallet och utfallet var tomt,
--   * däckets villkor `NOT EXISTS (… status='PENDING')` släppte bolaget fritt,
--     och `nextActionAt` sattes till `retryHoursNoAnswer` — tjugo timmar.
--
-- Nettot: en kund som bett en namngiven säljare ringa tillbaka låg dagen efter
-- i hela golvets däck, utan lås, utan löfte och utan spår någonstans. Precis
-- det golvet rapporterade: en säljare tryckte "ring igen", en annan fick upp
-- bolaget, och kunden gick inte att hitta på golvets återkomster.
--
-- Mätt i produktionen 2026-09-01: av 196 stängda återkomster stängdes **36 av
-- ett samtal där ingen svarade** — 35 `NO_ANSWER` och en som fastnade i växeln
-- (den sistnämnda är korrekt stängd, någon svarade faktiskt).
--
-- ## Rättelsen
--
-- De 33 som fortfarande går att laga öppnas igen, på den tid dispositionen
-- redan räknat fram: `Lead.nextActionAt`. Det är exakt vad den rättade koden
-- hade skrivit — samma tidpunkt som bolaget ändå skulle ringts, men med raden
-- kvar som PENDING och bunden till den som lovade. 31 av dem är förfallna och
-- hamnar därför överst i klockan hos sin säljare, vilket är rätt: löftet är
-- försenat, inte borta.
--
-- `seenAt` och `emailSentAt` nollas — ny tid, ny påminnelse — samma
-- nollställning som `rescheduleCallback` gör.
--
-- ## Tre undantag, medvetna
--
--   * **Ringt senare (2).** Ett senare samtal har redan avgjort bolagets öde.
--     Att öppna ett löfte bakom ett nyare samtal vore att skriva om historien.
--   * **Pensionerat (1).** Bolaget är ur spel; ett öppet löfte hade skickat
--     någon till en stängd dörr.
--   * **Kund, spärrat eller redan öppet löfte (0 idag).** Villkoren står kvar
--     ändå — migrationen ska vara sann också om den körs om.
--
-- Löftesgivaren, inte den som råkade ringa, får tillbaka bolaget: `ownerId`
-- sätts till återkomstens `sellerId` och `claimedAt` till nu. Låset behövs
-- strängt taget inte för att skydda bolaget — däckets återkomstvillkor gör
-- redan det — men utan det ser bolaget oägt ut i mappvyn, på lead-sidan och i
-- varningen från `leaseSpecificLead`, och invarianten "öppet löfte ⇒ låst till
-- löftesgivaren" ska gälla i datan och inte bara i koden.
--
-- Datumformatet: kolumnerna bär ISO med `T` och `+00:00`, 29 tecken.
-- `nextActionAt` kopieras rakt av och behåller därmed formatet; det som skrivs
-- fritt byggs med samma `strftime`-mask. Jämförelserna i tabellen är
-- textbaserade, så ett avvikande format sorterar fel mot resten.

-- ── 1. Löftena tillbaka ────────────────────────────────────────────────────

UPDATE "Callback"
SET "status"               = 'PENDING',
    "scheduledAt"          = (SELECT l."nextActionAt" FROM "Lead" l WHERE l."id" = "Callback"."leadId"),
    "completedAt"          = NULL,
    "completedOnAttemptId" = NULL,
    "seenAt"               = NULL,
    "emailSentAt"          = NULL,
    "updatedAt"            = strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now')
WHERE "status" = 'COMPLETED'
  AND EXISTS (
    SELECT 1 FROM "CallAttempt" a
     WHERE a."id" = "Callback"."completedOnAttemptId"
       AND a."result" IN ('NO_ANSWER', 'BUSY', 'VOICEMAIL_LEFT', 'VOICEMAIL_NO_MESSAGE')
       -- Inget nyare samtal på bolaget: det stängande samtalet måste
       -- fortfarande vara det sista som hänt.
       AND NOT EXISTS (
         SELECT 1 FROM "CallAttempt" b
          WHERE b."leadId" = a."leadId" AND b."startedAt" > a."startedAt"
       )
  )
  AND EXISTS (
    SELECT 1 FROM "Lead" l
     WHERE l."id" = "Callback"."leadId"
       AND l."retired" = 0
       AND l."hasActiveDeal" = 0
       AND l."nextActionAt" IS NOT NULL
  )
  -- Två öppna löften på samma bolag är alltid ett fel.
  AND NOT EXISTS (
    SELECT 1 FROM "Callback" o
     WHERE o."leadId" = "Callback"."leadId" AND o."status" = 'PENDING'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "DoNotCall" d
     WHERE (d."leadId" = "Callback"."leadId"
            OR (d."orgNumber" IS NOT NULL
                AND d."orgNumber" = (SELECT l."orgNumber" FROM "Lead" l WHERE l."id" = "Callback"."leadId")))
       AND (d."expiresAt" IS NULL OR d."expiresAt" > strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now'))
  );

-- ── 2. Leadet speglar löftet igen ──────────────────────────────────────────
--
-- `callbackAt` är ekot av den öppna raden och `nextActionAt` det däcket
-- sorterar på. De pekar redan på rätt tidpunkt — `scheduledAt` ovan kopierades
-- från `nextActionAt` — men `callbackAt` nollades när löftet stängdes och
-- måste tillbaka, annars ser bolaget ut att sakna löfte i mappvyn och på
-- lead-sidan.

UPDATE "Lead"
SET "callbackAt" = (SELECT c."scheduledAt" FROM "Callback" c
                     WHERE c."leadId" = "Lead"."id" AND c."status" = 'PENDING'
                     ORDER BY c."scheduledAt" ASC LIMIT 1),
    "ownerId"    = (SELECT c."sellerId" FROM "Callback" c
                     WHERE c."leadId" = "Lead"."id" AND c."status" = 'PENDING'
                     ORDER BY c."scheduledAt" ASC LIMIT 1),
    "claimedAt"  = strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now')
WHERE EXISTS (
  SELECT 1 FROM "Callback" c
   WHERE c."leadId" = "Lead"."id"
     AND c."status" = 'PENDING'
     AND c."completedAt" IS NULL
     AND c."seenAt" IS NULL
)
AND "callbackAt" IS NULL;
