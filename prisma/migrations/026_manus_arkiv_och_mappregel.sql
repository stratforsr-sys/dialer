-- 026_manus_arkiv_och_mappregel
--
-- Två nya kolumner på ScriptTemplate, och en städning av de fyra manus som
-- finns.
--
--
-- ARCHIVED
--
-- "Ta bort" fanns inte som knapp. `deleteTemplate` och `setTemplateActive` låg
-- i actions/scripts.ts men anropades aldrig från någon komponent — det gick
-- alltså varken att radera, stänga av eller slå på ett manus. Enda vägen in i
-- `active = false` var `deleteList`, som stänger av mappens manus innan mappen
-- raderas. Manus som hamnat där kunde ingen ta sig ur igen.
--
-- `archived` skiljs från `active` med flit:
--
--   active = false     pausat, ska tillbaka
--   archived = true    borta, men texten måste finnas kvar
--
-- Skillnaden finns för att en publicerad version kan ligga på tusentals
-- CallAttempt-rader och bär statistikens koppling till vad som faktiskt sades.
-- Att radera den vore att radera svaret på frågan vilket manus som sålde bäst.
-- Arkivering är därför vad "ta bort" betyder för ett manus som använts; ett
-- manus utan ett enda samtal raderas på riktigt.
--
--
-- SORTORDER
--
-- Manusen sorterades på `step`. Det räckte så länge varje steg hade exakt ett
-- manus, men inte när en mapp har två — då blev ordningen godtycklig. Lägst
-- först, inom sin mapp.
--
--
-- STÄDNINGEN
--
-- Alla fyra manus i databasen visade sig innehålla i praktiken samma sak: ett
-- helt säljmanus klistrat i en enda variant som börjar med "1. INTRO". Steget
-- de ligger under är en godtycklig hylla, inte en beskrivning av innehållet.
-- Det gav en konkret bugg i hantverkare_5000_alla: mappens ROI-manus innehöll
-- ett helt manus, och det allmänna INTRO-manuset visades bredvid det. Säljaren
-- fick samma text två gånger under två rubriker. Mappregeln ändras därför i
-- samma veva (se getActiveScripts): mappens manus ersätter de allmänna HELT,
-- inte steg för steg.
--
-- Namnen ljuger dessutom. Tre manus heter "… — <mappnamn>" men har listId
-- NULL: mapparna raderades, FK:n nollade listId, och när mapparna sedan
-- importerades om fick de nya id:n. Manusen blev föräldralösa.

ALTER TABLE "ScriptTemplate"
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ScriptTemplate"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Cockpiten slår upp mappens manus vid varje utdelning av leads och filtrerar
-- numera på archived i samma andetag.
CREATE INDEX IF NOT EXISTS "ScriptTemplate_listId_archived_active_idx"
  ON "ScriptTemplate" ("listId", "archived", "active");

-- ── Städning ───────────────────────────────────────────────────────────────

-- "Växel" är inget växelmanus. Det är ett komplett säljmanus för
-- PRP-behandling mot håravfall — en avslutad kampanj som inte har med
-- verksamheten att göra längre. Det stod redan inaktivt. Arkiveras, så att det
-- inte ligger kvar och ser ut som ett bortglömt växelmanus någon borde slå på.
-- De 3 409 samtalen behåller sin text.
UPDATE "ScriptTemplate"
   SET "archived" = true, "active" = false
 WHERE "id" = 'cmsghslaz000004li1hj06nc5';

-- Gammal dubblett: två manus med samma namn och nästan samma text för samma
-- mapp. Det här är det äldre, redan avstängda. Dess 402 samtal ligger kvar.
UPDATE "ScriptTemplate"
   SET "archived" = true, "active" = false
 WHERE "id" = 'cmtbhdbqa000604lavkm02j6g';

-- Skrivet för clicknet_leads_bokadirekt_import, föräldralöst sedan mappen
-- raderades och importerades om. Kopplas till mappens nya id och slås på.
-- Med den nya mappregeln är det då det enda manuset i den mappen — vilket är
-- precis vad ett manus skrivet för en mapp ska vara.
UPDATE "ScriptTemplate"
   SET "listId" = '33ff6696-f5cc-464b-9daf-a7b14368a0a7',
       "active" = true,
       "archived" = false,
       "name" = 'Manus — clicknet_leads_bokadirekt_import'
 WHERE "id" = 'cmtbh3shy000104l5vle18twm';

-- Det enda manus som faktiskt gäller alla mappar idag. Det heter "Intro —
-- leads_bygg_hantverk" men har listId NULL och går alltså ut överallt. Namnet
-- döps om till vad det är. Det får medvetet FORTSÄTTA vara allmänt: knöts det
-- till leads_bygg_hantverk (599 leads) hade Clicknet Lista 1, Utan hemsida
-- lead, sokning_Clicknet2 och Nya bolag stått helt utan manus.
UPDATE "ScriptTemplate"
   SET "name" = 'Allmänt manus'
 WHERE "id" = 'cmtgy5m1b000104joagtmy1a8';

-- Ligger under steget ROI men innehåller ett helt manus, öppning och allt.
-- Namnet får säga det, eftersom det är namnet säljaren ser som rubrik nu.
UPDATE "ScriptTemplate"
   SET "name" = 'Manus — hantverkare_5000_alla'
 WHERE "id" = 'cmtczzusc000104jotzk9636i';

-- Ordningen inom varje mapp: det som redan finns är ett manus per mapp, så
-- noll åt alla duger. Kolumnen börjar spela roll först när någon lägger till
-- ett andra manus i en mapp.
