-- 027_idempotenta_dispositioner
--
-- En kolumn och ett unikt index, så att cockpitens skrivkö kan försöka igen.
--
--
-- VARFÖR
--
-- `useDispositionQueue` lägger tillbaka en post som fallit på **nätverksfel**
-- men **kastar** en som fallit på **serverfel**. Skillnaden var medveten och
-- fel: ett nätverksfel vet vi inget om, men ett serverfel kunde lika gärna vara
-- en transaktion som timade ut under belastning — alltså precis det som går att
-- försöka igen.
--
-- Anledningen till att den inte gjorde det var att skrivningen inte var
-- idempotent. Ett omförsök hade skrivit ett andra samtal på samma bolag, med
-- ett nytt löpnummer, och dubblat raden i statistikens nämnare. Att kasta
-- posten var det mindre onda.
--
-- Priset betalades den 4 september: 59 samtal bar `CALLBACK_BOOKED` men bara 49
-- hade en `Callback`-rad. Säljarna såg remsan "kunde inte sparas" och tryckte om
-- för hand — ett bolag samlade fem försök i rad på två minuter — och två kunder
-- blev lovade ett samtal som inte fanns någonstans.
--
--
-- NYCKELN
--
-- `idempotencyKey` sätts av klienten när säljaren dispositionerar och följer
-- med varje omförsök av samma tryck. Servern slår upp den före skrivningen och
-- svarar "redan gjort" i stället för att skriva igen; det unika indexet är
-- backstoppet för två anrop som råkar korsa varandra.
--
-- Kolumnen ligger bredvid `providerCallId`, som är samma sorts nyckel för
-- telefoni-webhooks — samma händelse levereras om även där.
--
-- Nullbar med flit. De 5 700 rader som redan finns skrevs innan nyckeln fanns,
-- och rader som inte kommer från kön har ingen. **SQLites unika index tillåter
-- flera NULL**, så en partiell backfill behövs inte och får inte göras: två
-- rader med tom sträng hade kolliderat, till skillnad från två med NULL.

ALTER TABLE "CallAttempt" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CallAttempt_idempotencyKey_key"
  ON "CallAttempt" ("idempotencyKey");
