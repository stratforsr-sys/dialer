-- 018_lead_registered_at
--
-- När bolaget registrerades. Finns i praktiskt taget varje export ur ett
-- företagsregister och är en av de få uppgifterna som säger något om bolaget
-- utan att någon behöver ringa det: ett bolag registrerat i mars i år är ett
-- annat samtal än ett som funnits sedan 1994.
--
-- Nullbar, som employees och revenue. NULL betyder "uppgiften saknas" — filen
-- hade ingen kolumn, eller cellen var tom, eller innehållet gick inte att
-- tolka som ett datum. Ett defaultvärde hade gjort de fallen omöjliga att
-- skilja från ett bolag som faktiskt registrerades den dagen.
--
-- Lagras som datum utan tid i UTC. Registreringsdatum har ingen
-- klockslagsprecision, och en tidsdel hade gjort "registrerad samma dag"
-- beroende av tidszon. Ett årtal utan månad och dag i filen landar på
-- 1 januari — påhittad precision på dagen, men rätt svar på frågan kolumnen
-- finns för.

ALTER TABLE "Lead" ADD COLUMN "registeredAt" DATETIME;
