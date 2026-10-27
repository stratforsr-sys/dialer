-- 033 — säljarens egen mapp, "Mina leads"
--
-- En säljare som lägger till ett bolag för hand väljer mellan två saker: dela
-- det i en ringlista, eller behålla det själv. Det senare behöver en plats, och
-- platsen är en vanlig mapp med en ägare. Då gäller allt som redan gäller för
-- mappar — cockpiten ringer den, `ListAccess` styr vem som ser den, och regeln
-- från 031 (ett bolag i exakt en mapp) håller utan undantag.
--
-- `personalForId` pekar ut vems mappen är. UNIQUE: en mapp per säljare, och
-- det är villkoret som gör att två samtidiga "behåll till mig" inte kan skapa
-- två. `ON DELETE SET NULL` är en sista utväg — `deleteUser` gör om mappen till
-- en vanlig mapp innan kontot försvinner, så att bolagen inte blir kvar i en
-- mapp ingen kan dela ut.
--
-- Bara en ny nullbar kolumn och ett index. Befintliga mappar får NULL och
-- beter sig exakt som förut; koden som inte känner kolumnen märker ingenting.

ALTER TABLE "CallList" ADD COLUMN IF NOT EXISTS "personalForId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CallList_personalForId_key"
  ON "CallList" ("personalForId");

ALTER TABLE "CallList"
  ADD CONSTRAINT "CallList_personalForId_fkey"
  FOREIGN KEY ("personalForId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
