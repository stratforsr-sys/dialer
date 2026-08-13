-- 017_lasning_styrs_av_utfallet
--
-- Släpper claim-lås som satts av samtal där inget hände.
--
-- `Lead.claimedAt` är låset: så länge det är satt ser ingen annan säljare
-- bolaget i sitt däck (`CLAIM_TTL_DAYS` = 60). Fram till nu sattes det vid
-- VARJE disposition, vilket betyder att den som råkade ringa först band upp
-- bolaget i två månader — oavsett om samtalet gav ett avslut eller gick till
-- en telefonsvarare.
--
-- Räknat i produktionen innan den här filen:
--
--   låsta, ej pensionerade leads                       590
--     senaste utfall CALLBACK_BOOKED (ska vara låst)    45
--     senaste utfall DM_NO                             164
--     inget utfall alls (svarar ej/upptaget/rb)        362
--     växelutfall och fel beslutsfattare                19
--
-- Regeln är nu: lås bara när det finns en relation att skydda —
-- `CALLBACK_BOOKED` (kunden bad om ett samtal av en viss person) och `SOLD`
-- (kunden är någons kund). Se `claimsLead` i src/lib/scheduler.ts.
--
-- Sålda leads har `retired = 1` och rörs inte av villkoren nedan; de ligger
-- utanför rotationen ändå. Bolag med en öppen återkomst rörs inte heller —
-- de undantas redan av återkomstfiltret i `leaseNextLeads`, men att släppa
-- deras lås här hade gjort dem fria i samma sekund som återkomsten ringts.

UPDATE "Lead"
SET "claimedAt" = NULL
WHERE "claimedAt" IS NOT NULL
  AND "retired" = 0
  AND "hasActiveDeal" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "Callback" c
    WHERE c."leadId" = "Lead"."id" AND c."status" = 'PENDING'
  )
  AND COALESCE((
    SELECT a."outcome" FROM "CallAttempt" a
    WHERE a."leadId" = "Lead"."id"
    ORDER BY a."startedAt" DESC
    LIMIT 1
  ), '') NOT IN ('CALLBACK_BOOKED', 'SOLD');

-- `ownerId` lämnas orörd med flit. Den är "senast bearbetad av" och ger
-- säljaren bolaget i sina egna vyer; den låser ingen ute. Låset är claimedAt,
-- och det är bara det som ska bero på utfallet.
