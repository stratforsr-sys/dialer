-- 013_industry_source
--
-- Var branschen kom ifrån, och hur säker den är.
--
-- Utan källa går klassificeringen inte att köra om selektivt. De 187 leads som
-- saknar hemsida får en gissning ur bolagsnamnet — den ska ersättas den dag en
-- sajt dyker upp, medan en bransch en säljare satt för hand aldrig får skrivas
-- över av en modell. Med bara en industry-kolumn är de tre fallen omöjliga att
-- skilja åt, och omkörningen blir antingen för feg eller förstörande.
--
-- Konfidens som eget tal och inte inbakat i källan: tröskeln för vad som är
-- värt att visa kommer att justeras när vi ser utfallet, och då ska gamla rader
-- kunna filtreras om utan att klassificeras om.

ALTER TABLE "Lead" ADD COLUMN "industrySource" TEXT;
ALTER TABLE "Lead" ADD COLUMN "industryConfidence" INTEGER;

-- Kön för klassificeringen är "leads utan bransch", och den frågan ställs varje
-- gång jobbet vaknar.
CREATE INDEX IF NOT EXISTS "Lead_industrySource_idx" ON "Lead" ("industrySource");
