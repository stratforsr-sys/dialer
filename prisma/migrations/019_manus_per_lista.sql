-- 019_manus_per_lista
--
-- Ett manus kan nu höra till en enskild mapp.
--
-- Fram till nu fanns ett manus per steg, gemensamt för allt som ringdes. Det
-- håller så länge alla mappar innehåller samma sorts bolag, och det gör de
-- inte: en mapp med byggfirmor och en med redovisningsbyråer öppnas inte med
-- samma mening. Alternativet — att skriva om det allmänna manuset inför varje
-- kampanj — river dessutom sönder statistiken varje gång, eftersom en
-- redigering skapar en ny version och gammalt utfall då pekar på en text som
-- inte längre används.
--
--   listId IS NULL   manuset gäller alla mappar (allt som finns idag)
--   listId = <mapp>  manuset gäller BARA den mappen, och ersätter det
--                    allmänna manuset för samma steg när säljaren ringer där
--
-- Ersätter, inte kompletterar: två manus för samma steg på skärmen samtidigt
-- är samma sak som inget manus, för ingen läser två alternativ mitt i ett
-- samtal. Saknas ett mappmanus för steget faller cockpiten tillbaka på det
-- allmänna, så en mapp behöver bara skriva om det steg som faktiskt skiljer
-- sig — oftast öppningen.
--
-- ON DELETE SET NULL och inte CASCADE: en publicerad version kan ligga på
-- hundratals CallAttempt-rader, och en kaskad hade tagit bort just den text
-- statistiken pekar på. `deleteList` inaktiverar mappens manus innan mappen
-- raderas, så ett manus som blir mappfritt här är redan avstängt och kan
-- aldrig råka börja gälla för alla.
--
-- Befintliga manus får NULL och fortsätter alltså gälla överallt, precis som
-- före migrationen.

ALTER TABLE "ScriptTemplate"
  ADD COLUMN "listId" TEXT
  REFERENCES "CallList" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cockpiten slår upp manusen per mapp och steg vid varje utdelning av leads.
CREATE INDEX IF NOT EXISTS "ScriptTemplate_listId_step_active_idx"
  ON "ScriptTemplate" ("listId", "step", "active");
