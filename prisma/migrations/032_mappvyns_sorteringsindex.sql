-- 032 — index för mappvyns sortering
--
-- `getList` hämtar mappens bolag med `orderBy: { addedAt: "asc" }`. Det enda
-- index som ledde med `listId` var `LeadOnList_listId_createdByImport_idx`, och
-- det bär inte `addedAt`. SQLite hittade alltså mappens rader via indexet men
-- måste sortera dem i en temporär b-tree efteråt:
--
--   |--SEARCH lol USING INDEX LeadOnList_listId_createdByImport_idx (listId=?)
--   |--SEARCH l USING INDEX sqlite_autoindex_Lead_1 (id=?)
--   `--USE TEMP B-TREE FOR ORDER BY
--
-- Följden är att ett `LIMIT` inte kostar mindre än ingen gräns alls — alla
-- mappens rader måste läsas innan de går att sortera. Mätt 2026-09-28 mot
-- produktionsdatan, största mappen (11 277 bolag): 41 441 lästa rader både med
-- och utan `LIMIT 100`.
--
-- Med det här indexet försvinner sorteringssteget, och samma fråga med
-- `LIMIT 100` kostar 200 rader.
--
-- Indexet är enbart en läsväg: inga kolumner, villkor eller rader ändras, och
-- det går att släppa igen med `DROP INDEX` utan följder för datan.

CREATE INDEX IF NOT EXISTS "LeadOnList_listId_addedAt_idx"
  ON "LeadOnList" ("listId", "addedAt");

-- Färsk statistik för den nya läsvägen. Utan den känner SQLite indexet men
-- inte dess fördelning, och planvalet kan falla tillbaka på det gamla.
ANALYZE "LeadOnList";
