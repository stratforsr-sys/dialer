-- 021 — Läkning: arbetslås kvarlämnade av "Nästa"
--
-- Fram till 2026-08-28 flyttade knappen "Nästa" i cockpiten bara markören.
-- Arbetslåset (leasedById / leasedUntil) låg kvar på bolaget säljaren passerat,
-- och ingen släppte det: syncLeases förnyar bara kön framför markören, och
-- sessionens avslut släppte bara slice(index). Bolaget låg alltså osynligt för
-- hela golvet tills leasen gick ut en kvart senare. Se ARBETSLOGG.md 2026-08-28.
--
-- Koden är lagad. Den här filen städar det som redan låg låst.
--
-- **Urvalet är låsets färskhet, inte dess skäl.** Kolumnen bär ingen anledning,
-- så ett passerat bolag går inte att skilja från ett obearbetat i själva raden.
-- Det går däremot att skilja dem på förnyelsen: cockpiten förnyar kön framför
-- markören var femte minut på en lease som lever i femton, så ett lås som
-- fortfarande används har ALLTID mer än tio minuter kvar. Ett lås med mindre än
-- så förnyas inte av någon — det är ett passerat bolag, eller en flik som är
-- stängd. Nio minuter som gräns lämnar en minuts marginal åt bägge håll.
--
-- Ett släppt lås är ingen förlust: bolaget blir ringbart igen, vilket är exakt
-- vad det ska vara. Skulle en säljare ändå ha raden i sin kö serveras den om av
-- nästa påfyllning. Ingenting annat rörs — inget utfall, ingen attemptCount,
-- ingen nextActionAt. Att passera ett bolag är inte en händelse och ska inte
-- lämna ett spår.

UPDATE "Lead"
   SET "leasedById" = NULL,
       "leasedUntil" = NULL
 WHERE "leasedUntil" IS NOT NULL
   AND "leasedUntil" < strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now', '+9 minutes');
