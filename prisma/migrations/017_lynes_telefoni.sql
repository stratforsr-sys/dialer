-- 017_lynes_telefoni
--
-- Tar emot samtalshändelser från Lynes växel.
--
-- Utgångsläget är ovanligt: Lynes webhook-format är inte publikt dokumenterat.
-- Hjälpcentret säger "kontakta Lynes för mer information" och det finns ingen
-- fältreferens att bygga mot. Schemat här är därför format-agnostiskt med flit,
-- och det förklarar de två designvalen som annars ser överdrivna ut:
--
--   1. "TelephonyEvent" sparar RÅ payload på varje accepterad leverans, för
--      alltid. Så länge vi inte vet vad Lynes skickar är rådatat det enda som
--      garanterat inte tappas — feltolkar normaliseringen ett fält går det att
--      räkna om i efterhand ur samma rader. Ett schema som bara sparar det vi
--      hann förstå hade tyst kastat resten.
--   2. "TelephonyCall" är skild från "CallAttempt". CallAttempt är säljarens
--      registrering — vad hen tryckte i dispositionen — och är faktatabellen
--      all statistik läses ur. Växelns bild av samma samtal är en ANNAN
--      observation: den vet ringtid, svarstid och inspelning, men inget om
--      utfallet. Skrivs de i samma rad kan de skriva över varandra, och då är
--      det inte längre möjligt att säga om "22 samtal" kom från säljaren eller
--      från växeln. De länkas i stället med callAttemptId.
--
-- Migrationen är rent additiv: inga befintliga tabeller ändras.

-- ── Råloggen ──────────────────────────────────────────────────────────────
--
-- Append-only. En rad per accepterad HTTP-leverans, oavsett om vi förstod
-- innehållet. "handled" skiljer de vi kunde tolka från de vi bara arkiverade.
CREATE TABLE IF NOT EXISTS "TelephonyEvent" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "provider"        TEXT NOT NULL DEFAULT 'lynes',

    -- Providerns eget leverans-id när det finns. Nyckeln som gör mottagningen
    -- idempotent: varje webhook som är värd namnet levererar om vid timeout,
    -- och utan det här hade en långsam databas gett dubbla rader.
    -- NULL tillåts flera gånger — SQLite räknar NULL som skilda i UNIQUE.
    "providerEventId" TEXT,

    -- Rått, oöversatt. Vi vet inte vilka värden Lynes använder ännu, och att
    -- mappa in dem i en enum nu hade kastat bort just den information som
    -- behövs för att skriva mappningen.
    "eventType"       TEXT,
    "callId"          TEXT,

    -- Vilken av de accepterade nyckelplaceringarna som matchade. Enda sättet
    -- att i efterhand se hur Lynes faktiskt autentiserar sig, så att de
    -- övriga kan stängas av när svaret är känt.
    "authMethod"      TEXT NOT NULL,

    "handled"         INTEGER NOT NULL DEFAULT 0,
    "error"           TEXT,
    "rawJson"         TEXT NOT NULL,
    "receivedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelephonyEvent_provider_providerEventId_key"
  ON "TelephonyEvent" ("provider", "providerEventId");
CREATE INDEX IF NOT EXISTS "TelephonyEvent_receivedAt_idx"
  ON "TelephonyEvent" ("receivedAt");
CREATE INDEX IF NOT EXISTS "TelephonyEvent_callId_idx"
  ON "TelephonyEvent" ("callId");
CREATE INDEX IF NOT EXISTS "TelephonyEvent_handled_receivedAt_idx"
  ON "TelephonyEvent" ("handled", "receivedAt");

-- ── Växelns användare ─────────────────────────────────────────────────────
--
-- Lynes har sina egna användare med egna id:n och anknytningar. Utan en
-- mappningstabell går ett samtal inte att tillskriva en säljare, och då är
-- statistiken per person värdelös.
--
-- Raden skapas automatiskt första gången en okänd växelanvändare dyker upp,
-- med userId = NULL. Det är MEDVETET: en okopplad rad som syns är mycket
-- bättre än ett tyst bortkastat samtal, och kopplingen kan göras i efterhand
-- utan att historiken går förlorad — TelephonyCall pekar på agenten, så alla
-- gamla samtal följer med i samma ögonblick som userId sätts.
CREATE TABLE IF NOT EXISTS "TelephonyAgent" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "provider"    TEXT NOT NULL DEFAULT 'lynes',

    -- Bästa stabila identifierare vi hittade i payloaden, i fallande ordning:
    -- växelns användar-id, anknytning, e-post, namn. Namn är sista utvägen och
    -- är instabilt, men bättre än att slå ihop alla okända till en rad.
    "externalId"  TEXT NOT NULL,

    "extension"   TEXT,
    "email"       TEXT,
    "name"        TEXT,

    -- NULL tills någon kopplas. Sätts automatiskt när e-posten matchar en
    -- User exakt — det är den enda matchning som är säker nog att göra utan
    -- att fråga. Namnmatchning gör den INTE: "Simon" i växeln och "Simon" i
    -- appen kan vara olika personer, och fel säljare på ett samtal förgiftar
    -- både statistiken och provisionen.
    "userId"      TEXT,
    "autoLinked"  INTEGER NOT NULL DEFAULT 0,

    "lastSeenAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelephonyAgent_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelephonyAgent_provider_externalId_key"
  ON "TelephonyAgent" ("provider", "externalId");
CREATE INDEX IF NOT EXISTS "TelephonyAgent_userId_idx"
  ON "TelephonyAgent" ("userId");
CREATE INDEX IF NOT EXISTS "TelephonyAgent_email_idx"
  ON "TelephonyAgent" ("email");

-- ── Samtalet enligt växeln ────────────────────────────────────────────────
--
-- En rad per samtal, inte per händelse. Ett samtal ger typiskt flera
-- leveranser (ringer → svarat → avslutat → inspelning klar) och raden
-- uppdateras av var och en. Upsert på providerCallId.
--
-- Fälten fylls på allt eftersom och är därför nästan alla nullbara. Ett
-- pågående samtal har ingen sluttid, och ett obesvarat får aldrig någon.
CREATE TABLE IF NOT EXISTS "TelephonyCall" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "provider"       TEXT NOT NULL DEFAULT 'lynes',
    "providerCallId" TEXT NOT NULL,

    "direction"      TEXT,
    -- Grov, härledd status: RINGING, ANSWERED, COMPLETED, NO_ANSWER, BUSY,
    -- FAILED, VOICEMAIL, UNKNOWN. Härledd ur "lastEventType", som är rå.
    "status"         TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastEventType"  TEXT,

    -- Numren som de kom och normaliserade. Båda sparas: E.164 är det som går
    -- att matcha på, råversionen är det som går att felsöka med när
    -- normaliseringen returnerar null (vilket den gör hellre än att gissa).
    "fromRaw"        TEXT,
    "toRaw"          TEXT,
    "fromE164"       TEXT,
    "toE164"         TEXT,

    -- Motparten: to vid utgående, from vid inkommande. Denormaliserad hit
    -- eftersom varenda uppslag mot lead och spärrlista frågar efter just den,
    -- och ett CASE i varje WHERE gör indexet oanvändbart.
    "otherPartyE164" TEXT,

    "startedAt"      DATETIME,
    "answeredAt"     DATETIME,
    "endedAt"        DATETIME,

    -- Sekunder. durationSec är hela samtalet inklusive ringtid, talkSec bara
    -- den uppkopplade delen. Skilda för att svarsfrekvens och samtalslängd är
    -- olika mått: 40 sekunder ringsignal är inte 40 sekunders samtal.
    "durationSec"    INTEGER,
    "talkSec"        INTEGER,
    "waitSec"        INTEGER,

    "hangupCause"    TEXT,
    "queueName"      TEXT,

    -- URL:en pekar med största sannolikhet in i Lynes och kräver inloggning
    -- där. Den sparas ändå: en länk en admin kan öppna är värd mer än inget,
    -- och den dagen vi vet hur den autentiseras finns historiken redan.
    "recordingUrl"   TEXT,
    "recordingId"    TEXT,

    "agentId"        TEXT,
    "userId"         TEXT,
    "leadId"         TEXT,
    "contactId"      TEXT,
    "callAttemptId"  TEXT,

    "eventCount"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelephonyCall_agentId_fkey" FOREIGN KEY ("agentId")
      REFERENCES "TelephonyAgent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TelephonyCall_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    -- Samtalet raderas med leadet: växelloggen är inte ett arkiv som ska
    -- överleva att bolaget tas bort ur systemet.
    CONSTRAINT "TelephonyCall_leadId_fkey" FOREIGN KEY ("leadId")
      REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TelephonyCall_contactId_fkey" FOREIGN KEY ("contactId")
      REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TelephonyCall_callAttemptId_fkey" FOREIGN KEY ("callAttemptId")
      REFERENCES "CallAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelephonyCall_provider_providerCallId_key"
  ON "TelephonyCall" ("provider", "providerCallId");

-- Statistikfrågorna: per säljare över tid, per dag, per lead.
CREATE INDEX IF NOT EXISTS "TelephonyCall_userId_startedAt_idx"
  ON "TelephonyCall" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "TelephonyCall_startedAt_idx"
  ON "TelephonyCall" ("startedAt");
CREATE INDEX IF NOT EXISTS "TelephonyCall_leadId_startedAt_idx"
  ON "TelephonyCall" ("leadId", "startedAt");
CREATE INDEX IF NOT EXISTS "TelephonyCall_agentId_idx"
  ON "TelephonyCall" ("agentId");
CREATE INDEX IF NOT EXISTS "TelephonyCall_callAttemptId_idx"
  ON "TelephonyCall" ("callAttemptId");

-- Efterhandskopplingen: "vilka samtal på det här numret saknar lead?".
-- Frågas både av matchningen när ett samtal kommer in och av städjobbet som
-- kopplar om när en kontakt får sitt nummer normaliserat i efterhand.
CREATE INDEX IF NOT EXISTS "TelephonyCall_otherPartyE164_startedAt_idx"
  ON "TelephonyCall" ("otherPartyE164", "startedAt");
