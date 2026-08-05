-- 005_dialer_foundation
--
-- Fundamentet för uppföljningsmotorn (Modul 4), manus och ramverk (Modul 3),
-- pitch-underlaget (Modul 2) och närvaro (Modul 5).
--
-- Allt är additivt: nya kolumner och nya tabeller. Ingen befintlig kolumn
-- ändras, ingen data flyttas, ingenting raderas. Migrationen går därför att
-- köra mot en levande databas utan stilleståndsfönster.

-- ─────────────────────────────────────────────────────────────────────────
-- Lead: schemaläggningskolumner
-- Denormaliserade på leadet så att "nästa lead att ringa" blir ett indexerat
-- villkor i stället för en aggregering över samtalshistoriken.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "nextActionAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "nextSlotId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "noAnswerStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "triedSlotsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Lead" ADD COLUMN "lastAttemptAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "lastResult" TEXT;
ALTER TABLE "Lead" ADD COLUMN "callbackAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "leasedById" TEXT;
ALTER TABLE "Lead" ADD COLUMN "leasedUntil" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "retired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "retiredReason" TEXT;

CREATE INDEX "Lead_retired_nextActionAt_idx" ON "Lead"("retired", "nextActionAt");
CREATE INDEX "Lead_leasedUntil_idx" ON "Lead"("leasedUntil");
CREATE INDEX "Lead_callbackAt_idx" ON "Lead"("callbackAt");

-- ─────────────────────────────────────────────────────────────────────────
-- Contact: normaliserade nummer
-- directPhone/switchboard är fritext från CSV och går inte att matcha mot ett
-- inkommande samtal. Utan de här kolumnerna är callback-fångst omöjlig.
-- Fylls av ett separat backfill-script, inte här.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "Contact" ADD COLUMN "directPhoneE164" TEXT;
ALTER TABLE "Contact" ADD COLUMN "switchboardE164" TEXT;

CREATE INDEX "Contact_directPhoneE164_idx" ON "Contact"("directPhoneE164");
CREATE INDEX "Contact_switchboardE164_idx" ON "Contact"("switchboardE164");

-- ─────────────────────────────────────────────────────────────────────────
-- Ringpass — konfigurerbara i admin
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "CallSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX "CallSlot_active_order_idx" ON "CallSlot"("active", "order");

-- Startvärden. 11–12 och 13–14 är de två sämsta blocken i all publicerad data
-- och krockar dessutom med svensk lunch — därför förskjutna. Ändras i admin.
INSERT OR IGNORE INTO "CallSlot" ("id","name","startMinute","endMinute","order","active") VALUES
  ('slot_tidigt',      'Tidigt (07:45-08:45)',          465,  525, 1, true),
  ('slot_formiddag',   'Förmiddag (09:15-11:15)',       555,  675, 2, true),
  ('slot_eftermiddag', 'Eftermiddag (13:15-14:45)',     795,  885, 3, true),
  ('slot_sen',         'Sen eftermiddag (15:30-16:45)', 930, 1005, 4, true);

-- ─────────────────────────────────────────────────────────────────────────
-- Uppföljningsmotorns reglage. Singleton, delad av hela teamet.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "DialerConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "cooldownDays" INTEGER NOT NULL DEFAULT 30,
    "leaseMinutes" INTEGER NOT NULL DEFAULT 15,
    "leaseBlockSize" INTEGER NOT NULL DEFAULT 25,
    "retryHoursNoAnswer" INTEGER NOT NULL DEFAULT 20,
    "retryHoursBusy" INTEGER NOT NULL DEFAULT 2,
    "retryHoursVoicemail" INTEGER NOT NULL DEFAULT 44,
    "retryHoursGatekeeper" INTEGER NOT NULL DEFAULT 68,
    "targetCallsPerHour" INTEGER NOT NULL DEFAULT 22,
    "idleAlertMinutes" INTEGER NOT NULL DEFAULT 25,
    "blockedDatesJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO "DialerConfig" ("id") VALUES ('singleton');

-- ─────────────────────────────────────────────────────────────────────────
-- Faktatabellen. Append-only.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT,
    "sellerId" TEXT NOT NULL,
    "listId" TEXT,
    "sessionId" TEXT,
    "attemptNo" INTEGER NOT NULL,
    "slotId" TEXT,
    "hourOfDay" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "result" TEXT NOT NULL,
    "outcome" TEXT,
    "noReason" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "idleBeforeSec" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "providerCallId" TEXT,
    "recordingUrl" TEXT,
    "dialedE164" TEXT,
    "scriptVersionId" TEXT,
    CONSTRAINT "CallAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CallList" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CallSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CallSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_scriptVersionId_fkey" FOREIGN KEY ("scriptVersionId") REFERENCES "ScriptVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CallAttempt_providerCallId_key" ON "CallAttempt"("providerCallId");
CREATE INDEX "CallAttempt_leadId_startedAt_idx" ON "CallAttempt"("leadId", "startedAt");
CREATE INDEX "CallAttempt_sellerId_startedAt_idx" ON "CallAttempt"("sellerId", "startedAt");
CREATE INDEX "CallAttempt_startedAt_idx" ON "CallAttempt"("startedAt");
CREATE INDEX "CallAttempt_result_startedAt_idx" ON "CallAttempt"("result", "startedAt");
CREATE INDEX "CallAttempt_outcome_startedAt_idx" ON "CallAttempt"("outcome", "startedAt");
CREATE INDEX "CallAttempt_listId_startedAt_idx" ON "CallAttempt"("listId", "startedAt");
CREATE INDEX "CallAttempt_attemptNo_result_idx" ON "CallAttempt"("attemptNo", "result");
CREATE INDEX "CallAttempt_scriptVersionId_idx" ON "CallAttempt"("scriptVersionId");
CREATE INDEX "CallAttempt_contactId_idx" ON "CallAttempt"("contactId");
CREATE INDEX "CallAttempt_slotId_idx" ON "CallAttempt"("slotId");

-- ─────────────────────────────────────────────────────────────────────────
-- Spärrlista. Nycklad på numret, inte på leadet.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "DoNotCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phoneE164" TEXT NOT NULL,
    "leadId" TEXT,
    "orgNumber" TEXT,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "addedById" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoNotCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DoNotCall_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DoNotCall_phoneE164_key" ON "DoNotCall"("phoneE164");
CREATE UNIQUE INDEX "DoNotCall_leadId_key" ON "DoNotCall"("leadId");
CREATE INDEX "DoNotCall_orgNumber_idx" ON "DoNotCall"("orgNumber");
CREATE INDEX "DoNotCall_expiresAt_idx" ON "DoNotCall"("expiresAt");

-- ─────────────────────────────────────────────────────────────────────────
-- Växelhantering
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "GatekeeperContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RECEPTION',
    "phoneE164" TEXT,
    "encounters" INTEGER NOT NULL DEFAULT 0,
    "passes" INTEGER NOT NULL DEFAULT 0,
    "lastTacticKey" TEXT,
    "lastTacticWorked" BOOLEAN,
    "lastEncounterAt" DATETIME,
    "lastSaid" TEXT,
    "dmName" TEXT,
    "dmTitle" TEXT,
    "dmDirectE164" TEXT,
    "dmMobileE164" TEXT,
    "dmAvailableAt" DATETIME,
    "dmAvailability" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GatekeeperContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GatekeeperContact_leadId_idx" ON "GatekeeperContact"("leadId");
CREATE INDEX "GatekeeperContact_phoneE164_idx" ON "GatekeeperContact"("phoneE164");
CREATE INDEX "GatekeeperContact_dmAvailableAt_idx" ON "GatekeeperContact"("dmAvailableAt");

-- ─────────────────────────────────────────────────────────────────────────
-- Ramverksprogress + invändningar
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "CallFrameworkProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callAttemptId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "furthestStep" TEXT NOT NULL DEFAULT 'VAXEL',
    "endedAtStep" TEXT NOT NULL DEFAULT 'VAXEL',
    "closeAttempts" INTEGER NOT NULL DEFAULT 0,
    "closedWon" BOOLEAN NOT NULL DEFAULT false,
    "objectionCount" INTEGER NOT NULL DEFAULT 0,
    "objectionsHandled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallFrameworkProgress_callAttemptId_fkey" FOREIGN KEY ("callAttemptId") REFERENCES "CallAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CallFrameworkProgress_callAttemptId_key" ON "CallFrameworkProgress"("callAttemptId");
CREATE INDEX "CallFrameworkProgress_sellerId_createdAt_idx" ON "CallFrameworkProgress"("sellerId", "createdAt");
CREATE INDEX "CallFrameworkProgress_leadId_idx" ON "CallFrameworkProgress"("leadId");
CREATE INDEX "CallFrameworkProgress_furthestStep_idx" ON "CallFrameworkProgress"("furthestStep");
CREATE INDEX "CallFrameworkProgress_endedAtStep_idx" ON "CallFrameworkProgress"("endedAtStep");

CREATE TABLE "CallObjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "progressId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "atStep" TEXT NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "quote" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CallObjection_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "CallFrameworkProgress" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CallObjection_progressId_idx" ON "CallObjection"("progressId");
CREATE INDEX "CallObjection_tag_handled_idx" ON "CallObjection"("tag", "handled");

-- ─────────────────────────────────────────────────────────────────────────
-- Manus. Skrivs av chefen, versioneras, varianter gallras på datakrav.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "ScriptTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScriptTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ScriptTemplate_step_active_idx" ON "ScriptTemplate"("step", "active");

CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScriptVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScriptTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScriptVersion_templateId_version_key" ON "ScriptVersion"("templateId", "version");
CREATE INDEX "ScriptVersion_templateId_publishedAt_idx" ON "ScriptVersion"("templateId", "publishedAt");

CREATE TABLE "ScriptVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "body" TEXT NOT NULL,
    "requiredKeysJson" TEXT NOT NULL DEFAULT '[]',
    "minConfidence" INTEGER NOT NULL DEFAULT 50,
    CONSTRAINT "ScriptVariant_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ScriptVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ScriptVariant_versionId_priority_idx" ON "ScriptVariant"("versionId", "priority");

-- ─────────────────────────────────────────────────────────────────────────
-- Pitch-underlag. En rad per lead, en rad per uppgift.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "LeadDossier" (
    "leadId" TEXT NOT NULL PRIMARY KEY,
    "weaknessCount" INTEGER NOT NULL DEFAULT 0,
    "overallConfidence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fetchedAt" DATETIME,
    "staleAfter" DATETIME,
    "errorMessage" TEXT,
    CONSTRAINT "LeadDossier_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LeadDossier_status_staleAfter_idx" ON "LeadDossier"("status", "staleAfter");
CREATE INDEX "LeadDossier_weaknessCount_idx" ON "LeadDossier"("weaknessCount");

CREATE TABLE "LeadClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueNum" REAL,
    "valueStr" TEXT,
    "valueBool" BOOLEAN,
    "unit" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT,
    CONSTRAINT "LeadClaim_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "LeadDossier" ("leadId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadClaim_leadId_key_key" ON "LeadClaim"("leadId", "key");
CREATE INDEX "LeadClaim_key_idx" ON "LeadClaim"("key");

-- ─────────────────────────────────────────────────────────────────────────
-- Närvaro. En rad per säljare, alltid upsert.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE "SellerPresence" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "currentLeadId" TEXT,
    "currentCompany" TEXT,
    "currentListId" TEXT,
    "currentListName" TEXT,
    "callStartedAt" DATETIME,
    "sessionId" TEXT,
    "todayCalls" INTEGER NOT NULL DEFAULT 0,
    "todayMeetings" INTEGER NOT NULL DEFAULT 0,
    "todayTalkSec" INTEGER NOT NULL DEFAULT 0,
    "countersDate" TEXT NOT NULL DEFAULT '',
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SellerPresence_status_idx" ON "SellerPresence"("status");
CREATE INDEX "SellerPresence_lastHeartbeat_idx" ON "SellerPresence"("lastHeartbeat");

-- ─────────────────────────────────────────────────────────────────────────
-- Aktivitetsloggen: index för tidslinjen. Räkning ska ske mot CallAttempt,
-- som är typad och indexerad — Activity.metadata är JSON i en textkolumn och
-- går inte att gruppera på.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX "Activity_type_timestamp_idx" ON "Activity"("type", "timestamp");
