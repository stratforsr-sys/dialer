-- 008_import_person_and_place
--
-- Fyra kolumner som importfilerna redan innehåller men som systemet slängde:
-- förnamn, efternamn, ort och adress.
--
-- Contact.name behålls som visningsnamn och är fortsatt NOT NULL. firstName
-- och lastName ligger vid sidan av, inte i stället för — att i efterhand
-- splitta ett hopslaget namn på mellanslag går fel på "Anna Maria Ek" och
-- "Anders von Sydow", och tilltalsnamn i ett manus måste vara rätt.
--
-- Lead.address fanns redan i schemat men mappades aldrig i importen. city är
-- ny: manusets {ort} plockade tidigare sista ledet av address via en split på
-- komma, vilket gav postnummer eller hela adressen beroende på exportformat.

ALTER TABLE "Contact" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "lastName" TEXT;

ALTER TABLE "Lead" ADD COLUMN "city" TEXT;
