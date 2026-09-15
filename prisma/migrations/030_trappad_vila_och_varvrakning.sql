-- 030 — Vilan trappas, och varvet tar slut
--
-- Två fel i uppföljningsmotorn som båda handlar om samma sak: det fanns ingen
-- gräns för hur ofta, och ingen gräns för hur länge.
--
-- ## Fel 1 — "svarar ej" vilade 20 timmar, varje gång
--
-- `retryHoursNoAnswer` var en FAST vila. 20 timmar valdes för att nästa försök
-- skulle hamna i ett annat tidsfönster än föregående — men `alignToSlot`
-- flyttar ändå in tiden i nästa ringpass, så i praktiken betyder 20 timmar
-- "i morgon bitti". Med taket på åtta försök ringdes ett bolag som aldrig
-- svarade åtta arbetsdagar i rad.
--
-- Mätt på tre veckors produktionsdata 2026-09-15, tid mellan två samtal på
-- samma bolag:
--
--   under 1 dygn   450 samtal   varav  40 av en ANNAN säljare
--   1–2 dygn       296 samtal   varav 148 av en ANNAN säljare
--   2–4 dygn       179 samtal   varav  59 av en ANNAN säljare
--
-- 128 `BORTFALL` på fjorton dagar — fyra procent av alla samtal var någon som
-- bad att slippa bli kontaktad — är notan.
--
-- ## Fel 2 — varvet tog aldrig slut
--
-- Vid taket satte `computeNext` `attemptCount = 0`, `triedSlotsJson = '[]'`
-- och `cooldownDays` vila. Ingen räknare överlevde nollställningen, alltså
-- fanns ingen gräns och ingen utgång: åtta försök, trettio dagars vila, åtta
-- försök till, i evighet. Enda vägen ut ur rotationen gick genom att en
-- människa tryckte på bortfall, fel nummer eller inget telefonnummer.
--
-- Det är också varför en ringlista aldrig kunde bli färdig: nämnaren stod
-- stilla medan samma bolag maldes om.
--
-- ## Vad migrationen gör
--
--   1. `DialerConfig.maxRounds` — antal hela varv innan bolaget pensioneras
--      med `retiredReason = 'uttomd'`. 2 som standard.
--   2. `DialerConfig.retryBackoffFactor` — hur mycket vilan växer per
--      obesvarat samtal i rad. 2,0 ger 20 h, 40 h, 3,3 d, 6,7 d, 13,3 d och
--      sedan taket: åtta försök över ~54 dagar i stället för över åtta.
--   3. `DialerConfig.retryHoursMax` — tak för trappan. 336 h = fjorton dygn.
--   4. `Lead.roundCount` — varvräknaren som överlever nollställningen.
--   5. Backfill av `roundCount` ur samtalshistoriken.
--
-- Ingen läkning av `nextActionAt`. Till skillnad från migration 022, som
-- rättade en vila som var direkt skadlig (ett nej som ringdes om dagen efter),
-- är 20 timmar bara för kort — inte fel. Bolagen som vilar just nu kommer
-- tillbaka en gång till på gammal takt och hamnar därefter i trappan. Att
-- skjuta 3 000 bolag framåt i tid hade dessutom tömt däcket över en natt mitt
-- i ett säljpass.

-- ── 1–3. Reglagen ─────────────────────────────────────────────────────────
ALTER TABLE "DialerConfig" ADD COLUMN "maxRounds" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "DialerConfig" ADD COLUMN "retryBackoffFactor" REAL NOT NULL DEFAULT 2;
ALTER TABLE "DialerConfig" ADD COLUMN "retryHoursMax" INTEGER NOT NULL DEFAULT 336;

-- ── 4. Varvräknaren ───────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "roundCount" INTEGER NOT NULL DEFAULT 0;

-- ── 5. Backfill ur historiken ─────────────────────────────────────────────
--
-- Antal hela varv = antal registrerade samtal / taket, avrundat nedåt.
-- `CallAttempt` är append-only och överlever varje nollställning, så den är
-- den enda källa som kan svara på frågan i efterhand.
--
-- Raden pensionerar ingenting direkt. Den sätter bara räknaren, och beslutet
-- fattas nästa gång bolaget slår i taket — så inget bolag försvinner ur ett
-- pågående pass för att en migration kördes.
--
-- Taket läses ur konfigurationen och inte hårdkodas: ändras `maxAttempts`
-- senare är det de NYA varven som räknas framåt, och den här siffran är ett
-- utgångsläge, inte en sanning om det förflutna.
UPDATE "Lead" SET "roundCount" = (
  SELECT COUNT(*) / MAX(1, (SELECT c."maxAttempts" FROM "DialerConfig" c WHERE c."id" = 'singleton'))
  FROM "CallAttempt" ca WHERE ca."leadId" = "Lead"."id"
)
WHERE EXISTS (SELECT 1 FROM "CallAttempt" ca WHERE ca."leadId" = "Lead"."id");
