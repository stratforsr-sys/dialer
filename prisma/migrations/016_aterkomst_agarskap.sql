-- 016_aterkomst_agarskap
--
-- Öppnar återkomster som stängdes av fel person, eller före utsatt tid.
--
-- Bakgrunden: fram till den här migrationen stängde VARJE registrerat samtal
-- på ett lead ALLA öppna återkomster på det leadet — oavsett vem som lovat och
-- oavsett om tiden var inne. Effekten syntes inte förrän någon räknade:
--
--   9 stängda återkomster i produktion
--   8 av dem stängda av en annan säljare än den som lovade
--   7 av dem stängda FÖRE den utsatta tiden
--
-- Mekanismen: i samma sekund som en återkomst förföll blev leadet leasbart
-- igen och sorterades överst i däcket hos hela golvet (ORDER BY i
-- leaseNextLeads). Första kollega som dispositionerade bolaget stängde löftet,
-- och det försvann ur klockan hos säljaren som gav det — utan att hen ringt.
--
-- Koden i `recordAttempt` stänger nu bara den ringande säljarens egna,
-- förfallna återkomster (plus allas vid terminalt utfall), och `leaseNextLeads`
-- reserverar bolaget för den som lovade. Den här filen städar skadan som redan
-- är gjord.
--
-- Två villkor för att öppna en rad igen:
--   1. Den stängdes av ett samtal som någon ANNAN än löftesgivaren ringde, ELLER
--      den stängdes före den utsatta tiden — ett samtal på tisdagen infriar inte
--      ett löfte om att ringa på torsdagen.
--   2. Leadet är fortfarande i spel. Är det sålt eller pensionerat finns inget
--      att ringa om, och en återuppväckt rad hade skickat en säljare till ett
--      bolag som är ur rotationen.
--
-- `seenAt` nollställs med: raden ska larma igen, inte ligga tyst som kvitterad.

UPDATE "Callback"
SET "status"               = 'PENDING',
    "completedAt"          = NULL,
    "completedOnAttemptId" = NULL,
    "seenAt"               = NULL,
    -- Nytt mejl också. En rad som mejlades innan den felaktigt stängdes får
    -- annars aldrig en ny påminnelse.
    "emailSentAt"          = NULL,
    "updatedAt"            = CURRENT_TIMESTAMP
WHERE "status" = 'COMPLETED'
  AND "completedOnAttemptId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "CallAttempt" a
    WHERE a."id" = "Callback"."completedOnAttemptId"
      AND (
        a."sellerId" <> "Callback"."sellerId"
        OR "Callback"."completedAt" < "Callback"."scheduledAt"
      )
  )
  AND EXISTS (
    SELECT 1 FROM "Lead" l
    WHERE l."id" = "Callback"."leadId"
      AND l."retired" = 0
      AND l."hasActiveDeal" = 0
  );

-- ── Ekot på leadet ────────────────────────────────────────────────────────
--
-- `Lead.callbackAt` och `Lead.nextActionAt` är denormaliserade speglingar av
-- den tidigaste öppna raden. De skrevs till NULL respektive till rotationens
-- nästa tid när återkomsten felaktigt stängdes, så de måste tillbaka — annars
-- ligger löftet i klockan men bolaget serveras aldrig i cockpiten.
--
-- Bara leads som har en öppen återkomst rörs, och bara till den tidigaste av
-- dem: det är den som ska ringas härnäst.

UPDATE "Lead"
SET "callbackAt"   = (
      SELECT MIN(c."scheduledAt") FROM "Callback" c
      WHERE c."leadId" = "Lead"."id" AND c."status" = 'PENDING'
    ),
    "nextActionAt" = (
      SELECT MIN(c."scheduledAt") FROM "Callback" c
      WHERE c."leadId" = "Lead"."id" AND c."status" = 'PENDING'
    )
WHERE "retired" = 0
  AND "hasActiveDeal" = 0
  AND EXISTS (
    SELECT 1 FROM "Callback" c
    WHERE c."leadId" = "Lead"."id" AND c."status" = 'PENDING'
  );

-- Indexet som reservationen i leaseNextLeads frågar på: "finns en öppen
-- återkomst på det här leadet som tillhör någon annan?". Det körs en gång per
-- lead-kandidat i varje lease, alltså i den hetaste frågan i appen.
CREATE INDEX IF NOT EXISTS "Callback_leadId_status_sellerId_idx"
  ON "Callback" ("leadId", "status", "sellerId");
