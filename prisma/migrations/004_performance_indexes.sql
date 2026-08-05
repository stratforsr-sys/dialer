-- ============================================================================
-- 004: Index som saknades helt
--
-- Bara Activity, Meeting, CallSession och CallEvent hade index sedan tidigare.
-- Varje främmande nyckel som används i en include/join saknade index, vilket
-- gav full tabellscanning: t.ex. Contact.leadId scannades för varje lead som
-- laddades med sina kontakter.
--
-- Idempotent — IF NOT EXISTS på samtliga.
-- ============================================================================

-- ── Lead ────────────────────────────────────────────────────────────────────
-- ownerId: filtreras i all synlighetslogik och i claim-lås
CREATE INDEX IF NOT EXISTS "Lead_ownerId_idx" ON "Lead"("ownerId");

-- Täckande index för standardfrågan på /leads och /cockpit:
-- WHERE hasActiveDeal = false ORDER BY updatedAt
CREATE INDEX IF NOT EXISTS "Lead_hasActiveDeal_updatedAt_idx" ON "Lead"("hasActiveDeal", "updatedAt");

-- ── Contact ─────────────────────────────────────────────────────────────────
-- Laddas som include på i stort sett varje lead-fråga
CREATE INDEX IF NOT EXISTS "Contact_leadId_idx" ON "Contact"("leadId");

-- ── Deal ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Deal_leadId_idx" ON "Deal"("leadId");
CREATE INDEX IF NOT EXISTS "Deal_stageId_status_idx" ON "Deal"("stageId", "status");
CREATE INDEX IF NOT EXISTS "Deal_createdById_idx" ON "Deal"("createdById");

CREATE INDEX IF NOT EXISTS "DealProduct_dealId_idx" ON "DealProduct"("dealId");
CREATE INDEX IF NOT EXISTS "DealProduct_productId_idx" ON "DealProduct"("productId");

-- ── Meeting ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Meeting_leadId_idx" ON "Meeting"("leadId");
CREATE INDEX IF NOT EXISTS "Meeting_bookedById_idx" ON "Meeting"("bookedById");

-- ── Activity ────────────────────────────────────────────────────────────────
-- leadId+timestamp och actorId+timestamp fanns redan; contactId saknades
CREATE INDEX IF NOT EXISTS "Activity_contactId_idx" ON "Activity"("contactId");

-- ── Taggar ──────────────────────────────────────────────────────────────────
-- Primärnyckeln (leadId, tagId) täcker uppslag på leadId, men inte omvänt
CREATE INDEX IF NOT EXISTS "TagOnLead_tagId_idx" ON "TagOnLead"("tagId");

-- ── Ringlistor ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "CallList_createdById_idx" ON "CallList"("createdById");
