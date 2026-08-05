-- 007_remove_meetings
--
-- Bort med mötesbokningen. Verksamheten är one call close: säljaren stänger
-- affären i samtalet. Det som behövs är återkomster, inte bokade möten — och
-- CallAttempt.outcome = CALLBACK_BOOKED plus Lead.callbackAt hanterar redan
-- det, bättre än en separat mötestabell gjorde.
--
-- Aktivitetsloggen ska vara oföränderlig, så gamla MEETING_*-rader lämnas
-- orörda. De blir historiska poster med en typ som ingen ny kod skriver.
-- Att skriva om dem vore att skriva om historien.

-- Meeting-tabellen raderas. Den innehöll bokningar från den gamla modellen;
-- inget i den nya koden läser den.
DROP TABLE IF EXISTS "Meeting";

-- Dagsräknaren mäter avslut nu, inte bokningar.
ALTER TABLE "SellerPresence" RENAME COLUMN "todayMeetings" TO "todaySold";
