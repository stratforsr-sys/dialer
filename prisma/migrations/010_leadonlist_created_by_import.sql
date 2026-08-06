-- 010_leadonlist_created_by_import
--
-- Att ta bort en ringlista ska ta med sig de leads listan skapade, men lämna
-- kvar dem som redan fanns i dialern när importen kördes (dubbletterna).
--
-- För att kunna skilja de två fallen åt måste importen märka länken när den
-- görs. I efterhand går det inte: Lead.createdAt duger inte som proxy,
-- eftersom ett lead som importerades och återimporterades samma dag ser
-- exakt likadant ut som ett nyskapat.
--
-- DEFAULT false med flit. Alla länkar som redan finns när den här migrationen
-- körs får därmed false, vilket betyder "leadet fanns redan" — den försiktiga
-- tolkningen. Konsekvensen är att en lista som importerades FÖRE den här
-- ändringen inte tar med sig sina leads när den tas bort. Det är rätt
-- avvägning: att gissa fel åt andra hållet raderar leads som ingen bad om att
-- få bort, och den historiken går inte att få tillbaka.

ALTER TABLE "LeadOnList" ADD COLUMN "createdByImport" BOOLEAN NOT NULL DEFAULT false;

-- Raderingen frågar "vilka leads skapade den här listan", vilket utan index
-- blir en full scan av join-tabellen per borttagning.
CREATE INDEX IF NOT EXISTS "LeadOnList_listId_createdByImport_idx"
  ON "LeadOnList" ("listId", "createdByImport");
