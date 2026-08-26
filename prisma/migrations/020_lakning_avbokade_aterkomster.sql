-- 020_lakning_avbokade_aterkomster
--
-- Lagar datan som `syncLeadFromCallbacks` skadade. Koden är rättad i samma
-- commit; det här är städningen efter den.
--
-- ## Vad som hände
--
-- När den sista öppna återkomsten på ett lead försvann skrev
-- `syncLeadFromCallbacks` `nextActionAt = NULL` med motiveringen "tillbaka i
-- rotationen, ringbart direkt". Två saker blev fel av det:
--
--   1. Bolaget blev ringbart i samma sekund, oavsett hur nyligen det ringts.
--      Vilan som utfallet tjänade ihop försvann med löftet.
--   2. `ORDER BY l."nextActionAt" ASC` sorterar NULL **först** i SQLite. Bolaget
--      hamnade alltså inte bara tillbaka i kön utan allra överst i den — före
--      varje bolag som faktiskt väntat ut sin tur.
--
-- Mätt i produktionen 2026-08-26: 74 leads med `retired = 0` och
-- `nextActionAt IS NULL` trots att de ringts. **Alla 74** hade en avbokad
-- återkomst bakom sig. Det är därför säljarna såg samma bolag om och om igen.
--
-- ## Rättelsen
--
-- `nextActionAt` räknas om ur `lastAttemptAt` + vilotiden för `lastResult` —
-- samma tabell som `retryHours()` i scheduler.ts, läst ur DialerConfig så att
-- ändrade vilotider gäller även här.
--
-- Passjusteringen (`alignToSlot`) görs inte: den kräver vardagskontroll och
-- spärrade datum och går inte att uttrycka i SQL. Konsekvensen är att en
-- handfull leads kan landa på en tid utanför sina pass. Det spelar ingen roll
-- här — nästan alla tiderna ligger redan i det förflutna, och passet är en
-- mjuk preferens i ORDER BY, inte ett filter. Poängen är att tiden FINNS, så
-- att bolaget sorteras på sin verkliga tur i stället för att ligga överst.
--
-- Leads som aldrig ringts (`lastAttemptAt IS NULL`) rörs inte: NULL är rätt
-- svar där. De är obearbetade, inte vilande.

UPDATE "Lead"
SET "nextActionAt" = strftime(
      '%Y-%m-%dT%H:%M:%S.000+00:00',
      datetime(
        "lastAttemptAt",
        '+' || (
          SELECT CASE "Lead"."lastResult"
            WHEN 'BUSY'                 THEN c."retryHoursBusy"
            WHEN 'VOICEMAIL_LEFT'       THEN c."retryHoursVoicemail"
            WHEN 'VOICEMAIL_NO_MESSAGE' THEN c."retryHoursVoicemail"
            WHEN 'CONNECTED_GATEKEEPER' THEN c."retryHoursGatekeeper"
            ELSE c."retryHoursNoAnswer"
          END
          FROM "DialerConfig" c WHERE c."id" = 'singleton'
        ) || ' hours'
      )
    )
WHERE "retired" = 0
  AND "nextActionAt" IS NULL
  AND "lastAttemptAt" IS NOT NULL;

-- ## Kvarglömda claim-lås från före migration 017
--
-- Fram till 2026-08-13 satte varje disposition `claimedAt`, vilket band bolaget
-- till den som råkade ringa först i 60 dagar oavsett utfall. Migration 017 gav
-- regeln "lås bara när det finns en relation att skydda" (CALLBACK_BOOKED och
-- SOLD), men de lås som redan satts städades aldrig bort. 23 ligger kvar.
--
-- Villkoren är medvetet snäva, så att inget levande lås råkar med:
--
--   * `claimedAt = lastAttemptAt` — låset sattes av samtalet, inte av någon som
--     senare reserverade bolaget manuellt via `claimLead`. Alla 23 uppfyller
--     det exakt, vilket är väntat: `recordAttempt` skriver båda kolumnerna med
--     samma tidsstämpel.
--   * satt före 2026-08-13, alltså före regeln fanns.
--   * senaste samtalet var varken en bokad återkomst eller ett avslut.
--   * ingen öppen återkomst på bolaget.

UPDATE "Lead"
SET "claimedAt" = NULL
WHERE "claimedAt" IS NOT NULL
  AND "claimedAt" = "lastAttemptAt"
  AND "claimedAt" < '2026-08-13T24:00'
  AND NOT EXISTS (
    SELECT 1 FROM "Callback" cb
    WHERE cb."leadId" = "Lead"."id" AND cb."status" = 'PENDING'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "CallAttempt" a
    WHERE a."leadId" = "Lead"."id"
      AND a."outcome" IN ('CALLBACK_BOOKED', 'SOLD')
      AND a."startedAt" = (
        SELECT MAX(a2."startedAt") FROM "CallAttempt" a2 WHERE a2."leadId" = "Lead"."id"
      )
  );
