-- 012_lead_industry
--
-- Bransch på leadet. Säljaren ska se vad bolaget sysslar med innan samtalet
-- kopplas, utan att lämna cockpiten.
--
-- Två kolumner, inte en. industryCode är råvaran från källan ("62.010"),
-- industry är etiketten som visas ("IT och datakonsult"). Etiketten är en
-- tolkning — vilken huvudgrupp som ska heta vad är ett omdöme — och en
-- tolkning måste gå att göra om utan att originalet är förlorat. Sparas bara
-- den renderade texten går det inte att räkna om beståndet när mappningen
-- visar sig vara fel.
--
-- Indexerad på industry: "alla IT-bolag i listan" är den fråga en säljchef
-- ställer först, och utan index blir det en full scan av 2169 leads.

ALTER TABLE "Lead" ADD COLUMN "industry" TEXT;
ALTER TABLE "Lead" ADD COLUMN "industryCode" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_industry_idx" ON "Lead" ("industry");
