-- Migration 003: Add Callback (Återkomst) table
-- Run via: turso db shell <db-name> < prisma/migrations/003_callbacks.sql

CREATE TABLE IF NOT EXISTS "Callback" (
  "id"          TEXT     NOT NULL PRIMARY KEY,
  "scheduledAt" DATETIME NOT NULL,
  "notes"       TEXT,
  "completedAt" DATETIME,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leadId"      TEXT     NOT NULL,
  "userId"      TEXT     NOT NULL,
  CONSTRAINT "Callback_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Callback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Callback_scheduledAt_idx" ON "Callback"("scheduledAt");
CREATE INDEX IF NOT EXISTS "Callback_userId_scheduledAt_idx" ON "Callback"("userId", "scheduledAt");
