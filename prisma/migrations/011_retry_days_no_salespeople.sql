-- 011_retry_days_no_salespeople
--
-- "Vill inte prata med säljare" ska inte spärra leadet och inte heller lämna
-- det i den vanliga rotationen. Det ska vila i 30 dagar och sedan gå att ringa
-- igen.
--
-- Egen kolumn i stället för att återanvända cooldownDays: den styr vilan efter
-- UTTÖMDA försök, och de två talen ska kunna ställas oberoende av varandra.
-- Sätts de ihop kan man inte ändra det ena utan att i smyg ändra det andra.
--
-- I dagar, inte timmar som de övriga retry-reglagen. Det är avsiktligt: de
-- mäter en rotationspaus inom samma vecka, det här är en helt annan tidsskala.

ALTER TABLE "DialerConfig" ADD COLUMN "retryDaysNoSalespeople" INTEGER NOT NULL DEFAULT 30;
