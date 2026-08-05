-- 006_claim_strength
--
-- Säljstyrka och svaghetsflagga på varje uppgift.
--
-- Bakgrund: en körning mot 14 riktiga leads visade att de VANLIGASTE
-- bristerna (avsaknad av schema.org-markup, ingen analytics-tagg) samtidigt
-- är de SVAGASTE säljargumenten, medan de starkaste — sajt som säger "Hem",
-- sajt som inte svarar, inget hemsida alls — är sällsynta. Sorterar panelen
-- på förekomst får säljaren tre värdelösa punkter överst på varje samtal.
--
-- Styrka är alltså en annan dimension än säkerhet: ett påstående kan vara
-- nästan säkert sant och ändå ointressant att säga högt.

ALTER TABLE "LeadClaim" ADD COLUMN "strength" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "LeadClaim" ADD COLUMN "weakness" BOOLEAN NOT NULL DEFAULT false;

-- Sorteringen i cockpit: starkaste säljbara bristen först.
CREATE INDEX "LeadClaim_leadId_weakness_strength_idx"
  ON "LeadClaim"("leadId", "weakness", "strength");
