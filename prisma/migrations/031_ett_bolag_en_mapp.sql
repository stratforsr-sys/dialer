-- Ett bolag ligger i exakt en mapp.
--
-- `leaseNextLeads` vilar per BOLAG, inte per mapp. Ett bolag som ligger i tre
-- mappar kommer alltså tillbaka i vilken av de tre säljaren än sitter i så
-- fort vilan gått ut — och för säljaren, som just fått en ny lista, ser det ut
-- som att hela den nya listan är bolag hen redan ringt. Mätt 2026-09-18:
--
--     1 421  bolag låg i fler än en mapp (1 888 överflödiga rader)
--       161  bolag hade ringts av SAMMA säljare i fler än en mapp
--     11–43  sådana omtagningar per dag, hela september, oavbrutet
--
-- `scripts/avdubbla.ts` städade beståndet och importen länkar inte längre in
-- bolag som redan finns. Det här indexet är det som gör regeln till ett
-- faktum i stället för en överenskommelse mellan två kodställen: nästa gång
-- någon skriver en rad som lägger samma bolag i en andra mapp faller den, i
-- stället för att tyst börja om.
--
-- **Indexet ligger bara här, inte i `schema.prisma`.** En `@@unique([leadId])`
-- där gör relationen ett-till-ett i Prismas ögon: `Lead.lists` blir
-- `LeadOnList?` i stället för `LeadOnList[]`, och varje
-- `lists: { some: { listId } }` i koden slutar kompilera. Regeln hör hemma i
-- databasen; typerna ska inte ritas om för den. Se noten i `schema.prisma`.
--
-- Kör `scripts/avdubbla.ts --skarpt` FÖRE den här filen — annars faller
-- indexbygget på de dubbletter som fortfarande ligger kvar.

CREATE UNIQUE INDEX "LeadOnList_leadId_unik" ON "LeadOnList"("leadId");

-- Det gamla, icke-unika indexet på samma kolumn. Ett unikt index svarar på
-- allt det svarade på, så att låta båda ligga kvar är bara en skrivning till
-- att underhålla per rad.
DROP INDEX IF EXISTS "LeadOnList_leadId_idx";
