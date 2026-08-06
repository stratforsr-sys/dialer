-- 009_lead_employees_revenue
--
-- Antal anställda och omsättning från importfilen. Två kolumner som avgör om
-- ett lead är värt ett samtal, och som fanns i varje företagsregisterexport
-- redan innan importen kunde ta emot dem.
--
-- Båda nullbara. NULL betyder "uppgiften saknas", vilket är något helt annat
-- än noll anställda eller noll i omsättning — ett DEFAULT 0 hade gjort de två
-- fallen omöjliga att skilja åt så fort någon sorterar på kolumnen.
--
-- revenue är REAL och lagrar talet exakt som det stod i filen. Ingen
-- enhetsomräkning: exporterna blandar kronor och tkr utan att säga vilket,
-- och en gissning här hade blivit fel med faktor tusen på halva beståndet.

ALTER TABLE "Lead" ADD COLUMN "employees" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "revenue" REAL;
