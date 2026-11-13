/**
 * Verifiering av mötena — livscykeln, kalendern och hur "Möte bokat" sitter
 * ihop med resten av dispositionen.
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/test-moten.ts
 *
 * Det som måste hålla, i den ordning det kostar mest om det går fel:
 *
 *  1. **Ett bokat möte tar bolaget ur däcket och låser det** (`claimsLead`,
 *     `computeNext`, `deckState`). Går det fel ringer en kollega kunden
 *     mellan bokningen och mötet.
 *  2. **Tangenterna 1–4 i utfallssteget står kvar.** "Möte bokat" är 5.
 *     Flyttas en siffra registrerar golvet fel utfall i veckor.
 *  3. **Varje avgörande ger bolaget samma tillstånd som motsvarande utfall i
 *     cockpiten** (`leadEffect`). Annars är avgörandet en tyst väg förbi
 *     rotationens regler.
 *  4. **Kalenderfilen är giltig** — CRLF, vikta rader på byte och inte på
 *     tecken, och inga deltagare.
 */

import {
  nextWorkdays, joinDateTime, splitDateTime,
  validateMeetingDraft, emptyMeetingDraft, acceptableMeetingTime, clampDuration, cleanText,
  meetingEnd, needsOutcome, isOngoing, overlaps, conflictsFor, validateResolution,
  followUpOwnerId, leadEffect, resolutionLabel, statusLabel, meetingStats, pct, isValidEmail,
  type Resolution,
} from "../src/lib/moten.ts";
import {
  icsDate, icsEscape, foldIcsLine, buildIcs, googleCalendarUrl, outlookCalendarUrl,
  icsFileName, meetingDescription, meetingTitle,
} from "../src/lib/kalender.ts";
import { computeNext, claimsLead, type Slot, type SchedulerConfig } from "../src/lib/scheduler.ts";
import {
  OUTCOME_OPTIONS, stageAfterOutcome, shouldAskFramework, optionForKey,
} from "../src/lib/cockpit-flow.ts";
import { utfallAv, utfallText, UTFALL_ORDNING } from "../src/lib/utfall.ts";
import { deckState, deckStateLabel, isOutOfRotation } from "../src/lib/deck-state.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const NU = new Date("2026-11-13T13:00:00Z"); // fredag 14:00 svensk tid
const OM = (min: number) => new Date(NU.getTime() + min * 60_000);
/** `datetime-local`-värdet för en tidpunkt, i processens zon — så som rutan läser det. */
function local(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Utkastet ───────────────────────────────────────────────────────────────

console.log("\nMötesrutan: valideringen");
{
  const tom = validateMeetingDraft(emptyMeetingDraft(), NU);
  check("tomt utkast: tid, kontakt och hållare saknas", !!tom.at && !!tom.contactName && !!tom.holderId, JSON.stringify(tom));
  check("tomt utkast: längden har ett giltigt förval", !tom.durationMin);

  const bra = emptyMeetingDraft({ at: local(OM(24 * 60)), contactName: "Anna", holderId: "u1" });
  check("komplett utkast godkänns", Object.keys(validateMeetingDraft(bra, NU)).length === 0, JSON.stringify(validateMeetingDraft(bra, NU)));
  check("passerad tid avvisas", !!validateMeetingDraft({ ...bra, at: local(OM(-5)) }, NU).at);
  check("tid exakt nu avvisas", !!validateMeetingDraft({ ...bra, at: local(new Date(Math.floor(NU.getTime() / 60000) * 60000)) }, NU).at);
  check("över ett år fram avvisas (fel år)", !!validateMeetingDraft({ ...bra, at: local(OM(367 * 24 * 60)) }, NU).at);
  check("skräp i tidsfältet avvisas", !!validateMeetingDraft({ ...bra, at: "inte en tid" }, NU).at);
  check("4 minuter avvisas", !!validateMeetingDraft({ ...bra, durationMin: 4 }, NU).durationMin);
  check("481 minuter avvisas", !!validateMeetingDraft({ ...bra, durationMin: 481 }, NU).durationMin);
  check("30,5 minuter avvisas", !!validateMeetingDraft({ ...bra, durationMin: 30.5 }, NU).durationMin);
  check("bara blanksteg som kontakt avvisas", !!validateMeetingDraft({ ...bra, contactName: "   " }, NU).contactName);
  check("ogiltig e-post avvisas", !!validateMeetingDraft({ ...bra, contactEmail: "anna@" }, NU).contactEmail);
  check("tom e-post är frivillig", !validateMeetingDraft({ ...bra, contactEmail: "" }, NU).contactEmail);
  check("giltig e-post godkänns", !validateMeetingDraft({ ...bra, contactEmail: " anna@bolag.se " }, NU).contactEmail);
  check("isValidEmail: mellanslag i mitten avvisas", !isValidEmail("an na@bolag.se"));
}

console.log("\nServerns tolerans — skrivkön får inte kasta ett möte");
{
  check("två timmar gammalt (kön låg i ett avbrott) sparas", acceptableMeetingTime(OM(-120), NU));
  check("29 dagar gammalt sparas", acceptableMeetingTime(OM(-29 * 24 * 60), NU));
  check("31 dagar gammalt avvisas", !acceptableMeetingTime(OM(-31 * 24 * 60), NU));
  check("ett år fram sparas", acceptableMeetingTime(OM(365 * 24 * 60), NU));
  check("tre år fram avvisas", !acceptableMeetingTime(OM(3 * 366 * 24 * 60), NU));
  check("ogiltigt datum avvisas", !acceptableMeetingTime(new Date("x"), NU));
  check("längd: skräp → 30", clampDuration("abc") === 30);
  check("längd: 3 → 5", clampDuration(3) === 5);
  check("längd: 1000 → 480", clampDuration(1000) === 480);
  check("längd: 44,6 → 45", clampDuration(44.6) === 45);
  check("längd: NaN → 30", clampDuration(Number.NaN) === 30);
  check("text: blanksteg → null", cleanText("   ") === null);
  check("text: trimmas", cleanText("  Anna ") === "Anna");
  check("text: kapas", cleanText("x".repeat(600), 500)?.length === 500);
  check("text: inte en sträng → null", cleanText(42) === null);
}

console.log("\nDagvalen i rutan");
{
  // Fredag 2026-11-13 14:00 svensk tid.
  const d = nextWorkdays(NU, 6);
  check("sex vardagar", d.length === 6, JSON.stringify(d));
  check("i dag först", d[0].date === "2026-11-13" && d[0].label === "I dag");
  check("helgen hoppas över: nästa är måndag", d[1].date === "2026-11-16", d[1].date);
  check("måndag heter inte \"I morgon\" på en fredag", d[1].label !== "I morgon", d[1].label);
  check("inga lördagar eller söndagar", d.every((x) => ![0, 6].includes(new Date(x.date + "T12:00:00Z").getUTCDay())));
  const tors = nextWorkdays(new Date("2026-11-12T22:30:00Z"), 2); // torsdag 23:30 svensk tid
  check("sent på kvällen: i dag är fortfarande torsdag i Sverige", tors[0].date === "2026-11-12", tors[0].date);
  check("…och i morgon är fredag", tors[1].date === "2026-11-13" && tors[1].label === "I morgon");
  const lor = nextWorkdays(new Date("2026-11-14T10:00:00Z"), 1); // lördag
  check("på en lördag är första valet måndag", lor[0].date === "2026-11-16", lor[0].date);
  const omst = nextWorkdays(new Date("2026-10-23T10:00:00Z"), 4); // fredag före vintertid 25 okt
  check("över omställningen till vintertid: inga dubbla datum", new Set(omst.map((x) => x.date)).size === 4, JSON.stringify(omst));
  check("joinDateTime", joinDateTime("2026-11-17", "10:15") === "2026-11-17T10:15");
  check("joinDateTime utan tid → tomt", joinDateTime("2026-11-17", "") === "");
  const sp = splitDateTime("2026-11-17T10:15");
  check("splitDateTime", sp.date === "2026-11-17" && sp.time === "10:15");
  check("splitDateTime på tomt", splitDateTime("").date === "" && splitDateTime("").time === "");
}

// ── Tid och krockar ────────────────────────────────────────────────────────

console.log("\nTid, pågår och utfall saknas");
{
  const m = { scheduledAt: OM(-60), durationMin: 30, status: "BOOKED" as const };
  check("sluttiden = start + längd", meetingEnd(m).getTime() === OM(-30).getTime());
  check("bokat och slut: utfall saknas", needsOutcome(m, NU));
  check("exakt vid sluttiden: utfall saknas", needsOutcome({ ...m, scheduledAt: OM(-30) }, NU));
  check("bokat i framtiden: inget utfall krävs", !needsOutcome({ ...m, scheduledAt: OM(60) }, NU));
  check("genomfört och slut: inget utfall krävs", !needsOutcome({ ...m, status: "HELD" }, NU));
  check("pågår mitt i mötet", isOngoing({ ...m, scheduledAt: OM(-10) }, NU));
  check("pågår inte efter slutet", !isOngoing(m, NU));
  check("pågår inte före starten", !isOngoing({ ...m, scheduledAt: OM(1) }, NU));
}

console.log("\nKrockar hos samma hållare");
{
  const a = { scheduledAt: OM(0), durationMin: 30 };
  check("rygg i rygg krockar inte (10:00–10:30, 10:30–11:00)", !overlaps(a, { scheduledAt: OM(30), durationMin: 30 }));
  check("överlapp krockar", overlaps(a, { scheduledAt: OM(15), durationMin: 30 }));
  check("innesluten krockar", overlaps(a, { scheduledAt: OM(5), durationMin: 10 }));
  check("samma tid krockar", overlaps(a, a));
  check("krock är symmetrisk", overlaps({ scheduledAt: OM(15), durationMin: 30 }, a));
  const andra = [
    { id: "1", scheduledAt: OM(10), durationMin: 30, status: "BOOKED" as const },
    { id: "2", scheduledAt: OM(10), durationMin: 30, status: "CANCELLED" as const },
    { id: "3", scheduledAt: OM(120), durationMin: 30, status: "BOOKED" as const },
    { id: "egen", scheduledAt: OM(0), durationMin: 30, status: "BOOKED" as const },
  ];
  const k = conflictsFor({ id: "egen", ...a }, andra);
  check("bara öppna, överlappande, andra möten räknas", k.length === 1 && k[0].id === "1", JSON.stringify(k.map((x) => x.id)));
  check("ett nytt möte utan id jämförs mot alla", conflictsFor(a, andra).length === 2);
}

// ── Avgörandet ─────────────────────────────────────────────────────────────

console.log("\nAvgörandet: valideringen");
{
  const fram = { type: "callback" as const, at: OM(60) };
  check("såld utan affär avvisas", !!validateResolution({ status: "HELD", outcome: "SALD", dealId: "" }, NU));
  check("såld med affär godkänns", validateResolution({ status: "HELD", outcome: "SALD", dealId: "d1" }, NU) === null);
  check("nej utan anledning avvisas", !!validateResolution({ status: "HELD", outcome: "NEJ", noReason: null as never }, NU));
  check("nej med anledning godkänns", validateResolution({ status: "HELD", outcome: "NEJ", noReason: "PRIS" }, NU) === null);
  check("uppföljning som släpper avvisas", !!validateResolution({ status: "HELD", outcome: "UPPFOLJNING", followUp: { type: "release" } }, NU));
  check("uppföljning med återkomst godkänns", validateResolution({ status: "HELD", outcome: "UPPFOLJNING", followUp: fram }, NU) === null);
  check("uteblev + släpp godkänns", validateResolution({ status: "NO_SHOW", followUp: { type: "release" } }, NU) === null);
  check("avbokat + släpp godkänns", validateResolution({ status: "CANCELLED", followUp: { type: "release" } }, NU) === null);
  check("återkomst bakåt i tiden avvisas", !!validateResolution({ status: "NO_SHOW", followUp: { type: "callback", at: OM(-1) } }, NU));
  check("ogiltig tid avvisas", !!validateResolution({ status: "NO_SHOW", followUp: { type: "callback", at: new Date("x") } }, NU));
  check("nytt möte med 0 minuter avvisas", !!validateResolution({ status: "NO_SHOW", followUp: { type: "meeting", at: OM(60), durationMin: 0 } }, NU));
  check("nytt möte giltigt godkänns", validateResolution({ status: "CANCELLED", followUp: { type: "meeting", at: OM(60), durationMin: 45 } }, NU) === null);
  check("saknat nästa steg avvisas", !!validateResolution({ status: "NO_SHOW", followUp: undefined as never }, NU));
}

console.log("\nVem nästa steg tillhör");
{
  const m = { bookedById: "bokare", holderId: "hallare" };
  check("uteblev → den som bokade ringer upp", followUpOwnerId({ status: "NO_SHOW", followUp: { type: "release" } }, m) === "bokare");
  check("avbokat → den som bokade", followUpOwnerId({ status: "CANCELLED", followUp: { type: "release" } }, m) === "bokare");
  check("uppföljning efter mötet → den som höll det", followUpOwnerId({ status: "HELD", outcome: "UPPFOLJNING", followUp: { type: "callback", at: OM(60) } }, m) === "hallare");
}

console.log("\nVad avgörandet gör med bolaget — samma som dispositionen");
{
  const m = { bookedById: "bokare", holderId: "hallare" };
  const e = (r: Resolution) => leadEffect(r, m);
  check("såld → som SOLD", e({ status: "HELD", outcome: "SALD", dealId: "d" }).kind === "sold");
  const nej = e({ status: "HELD", outcome: "NEJ", noReason: "TIMING" });
  check("nej → som DM_NO med anledningen", nej.kind === "said_no" && nej.noReason === "TIMING");
  const nytt = e({ status: "NO_SHOW", followUp: { type: "meeting", at: OM(60), durationMin: 30 } });
  check("uteblev + nytt möte → låst till bokaren", nytt.kind === "new_meeting" && nytt.ownerId === "bokare");
  const ater = e({ status: "HELD", outcome: "UPPFOLJNING", followUp: { type: "callback", at: OM(90) } });
  check("uppföljning + återkomst → låst till hållaren", ater.kind === "callback" && ater.ownerId === "hallare" && ater.at.getTime() === OM(90).getTime());
  check("avbokat + släpp → tillbaka i rotationen", e({ status: "CANCELLED", followUp: { type: "release" } }).kind === "release");
}

console.log("\nEtiketterna");
{
  check("loggrad: såld", resolutionLabel({ status: "HELD", outcome: "SALD", dealId: "d" }) === "Möte genomfört — såld");
  check("loggrad: nej med anledning", resolutionLabel({ status: "HELD", outcome: "NEJ", noReason: "HAR_BYRA" }).endsWith("Har byrå"));
  check("loggrad: uteblev + återkomst", resolutionLabel({ status: "NO_SHOW", followUp: { type: "callback", at: OM(1) } }).includes("återkomst bokad"));
  check("loggrad: avbokat + släpp", resolutionLabel({ status: "CANCELLED", followUp: { type: "release" } }).includes("släppt"));
  const b = { scheduledAt: OM(60), durationMin: 30, status: "BOOKED" as const };
  check("status: bokat", statusLabel(b, NU) === "Bokat");
  check("status: pågår", statusLabel({ ...b, scheduledAt: OM(-10) }, NU) === "Pågår");
  check("status: utfall saknas", statusLabel({ ...b, scheduledAt: OM(-60) }, NU) === "Utfall saknas");
  check("status: genomfört — såld", statusLabel({ ...b, status: "HELD", outcome: "SALD" }, NU) === "Genomfört — såld");
  check("status: kom inte", statusLabel({ ...b, status: "NO_SHOW" }, NU) === "Kom inte");
  check("status: avbokat", statusLabel({ ...b, status: "CANCELLED" }, NU) === "Avbokat");
}

console.log("\nStatistiken");
{
  const r = (status: "BOOKED" | "HELD" | "NO_SHOW" | "CANCELLED", min: number, outcome: "SALD" | "NEJ" | null = null) =>
    ({ scheduledAt: OM(min), durationMin: 30, status, outcome });
  const s = meetingStats([
    r("HELD", -500, "SALD"), r("HELD", -400, "NEJ"), r("HELD", -300, null),
    r("NO_SHOW", -200), r("CANCELLED", -100), r("BOOKED", -90), r("BOOKED", 60),
  ], NU);
  check("bokade = alla rader", s.booked === 7);
  check("genomförda 3, uteblivna 1, avbokade 1", s.held === 3 && s.noShow === 1 && s.cancelled === 1);
  check("väntar på utfall 1, kommande 1", s.awaiting === 1 && s.upcoming === 1);
  check("show rate = 3/(3+1) — avbokade utanför nämnaren", s.showRate === 0.75, String(s.showRate));
  check("avslutsgrad = 1/3", Math.abs((s.closeRate ?? 0) - 1 / 3) < 1e-9);
  const tom = meetingStats([], NU);
  check("inga avgjorda möten: show rate okänd, inte 0 %", tom.showRate === null && tom.closeRate === null);
  check("pct: 0,75 → 75 %", pct(0.75) === "75 %");
  check("pct: okänt → streck", pct(null) === "–");
}

// ── Kalendern ──────────────────────────────────────────────────────────────

console.log("\nKalenderfilen (RFC 5545)");
{
  const m = {
    id: "mtg_1",
    start: new Date("2026-11-17T09:15:00.000Z"),
    durationMin: 45,
    companyName: "Åsa & Söner Bygg AB",
    contactName: "Åsa Öberg",
    contactEmail: "asa@sonerbygg.se",
    contactPhone: "+46701234567",
    kindLabel: "Fysiskt",
    location: "Storgatan 1, 411 01 Göteborg",
    note: "Vill se offert på SEO; tar med ekonomichefen, Per",
    holderName: "Fredrik",
  };
  check("UTC-format", icsDate(m.start) === "20261117T091500Z", icsDate(m.start));
  check("escape: \\ ; , och radbrytning", icsEscape("a,b;c\\d\ne") === "a\\,b\\;c\\\\d\\ne", icsEscape("a,b;c\\d\ne"));
  const ics = buildIcs(m, NU);
  check("börjar och slutar rätt", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  check("bara CRLF — ingen ensam LF", !/[^\r]\n/.test(ics));
  const enc = new TextEncoder();
  const fysiska = ics.split("\r\n").filter((l) => l.length > 0);
  check("varje fysisk rad ≤ 75 oktetter", fysiska.every((l) => enc.encode(l).length <= 75), String(Math.max(...fysiska.map((l) => enc.encode(l).length))));
  check("DTSTART", ics.includes("DTSTART:20261117T091500Z"));
  check("DTEND = start + 45 min", ics.includes("DTEND:20261117T100000Z"));
  check("UID stabilt per möte", ics.includes("UID:mtg_1@dialer.clicknet"));
  check("ingen ATTENDEE (Outlook läser den som mottagen inbjudan)", !ics.includes("ATTENDEE"));
  check("påminnelse 15 min före", ics.includes("TRIGGER:-PT15M"));
  const ovikt = ics.replace(/\r\n /g, "");
  check("LOCATION med skyddat komma", ovikt.includes("LOCATION:Storgatan 1\\, 411 01 Göteborg"));
  check("anteckningens semikolon skyddat", ovikt.includes("SEO\\; tar med"));
  check("utan plats: ingen LOCATION-rad", !buildIcs({ ...m, location: null }, NU).includes("LOCATION"));

  const lang = "DESCRIPTION:" + "Åäö€".repeat(40);
  const vikt = foldIcsLine(lang);
  check("vikning: ihopfogad blir originalet", vikt.replace(/\r\n /g, "") === lang);
  const delar = vikt.split("\r\n");
  check("vikning: ingen del över gränsen", delar.every((d, i) => enc.encode(d).length <= (i === 0 ? 75 : 75)));
  check("vikning: inga sönderdelade tecken", delar.every((d) => !new TextDecoder().decode(enc.encode(d)).includes("�")));
  check("kort rad viks inte", foldIcsLine("SUMMARY:kort") === "SUMMARY:kort");

  check("filnamn utan å/ä/ö och &", icsFileName(m) === "mote-Asa-Soner-Bygg-AB-2026-11-17.ics", icsFileName(m));
  check("filnamn när namnet bara är tecken", icsFileName({ ...m, companyName: "!!!" }) === "mote-bolag-2026-11-17.ics");
  check("titel med kontakt", meetingTitle(m) === "Möte: Åsa & Söner Bygg AB (Åsa Öberg)");
  check("titel utan kontakt", meetingTitle({ companyName: "X AB", contactName: null }) === "Möte: X AB");
  const desc = meetingDescription({ ...m, contactPhone: null, holderName: null });
  check("beskrivning hoppar över tomma fält", !desc.includes("Telefon:") && !desc.includes("Håller mötet:") && desc.includes("E-post: asa@sonerbygg.se"));

  const g = new URL(googleCalendarUrl(m));
  check("Google: datum som start/slut i UTC", g.searchParams.get("dates") === "20261117T091500Z/20261117T100000Z");
  check("Google: kunden som gäst", g.searchParams.get("add") === "asa@sonerbygg.se");
  check("Google: platsen följer med", g.searchParams.get("location") === m.location);
  check("Google: utan e-post ingen gäst", !new URL(googleCalendarUrl({ ...m, contactEmail: null })).searchParams.has("add"));

  const o = new URL(outlookCalendarUrl(m));
  check("Outlook: värd outlook.office.com", o.host === "outlook.office.com");
  check("Outlook: start i ISO med Z", o.searchParams.get("startdt") === "2026-11-17T09:15:00Z", o.searchParams.get("startdt") ?? "");
  check("Outlook: slut i ISO med Z", o.searchParams.get("enddt") === "2026-11-17T10:00:00Z");
  check("Outlook: kunden som mottagare", o.searchParams.get("to") === "asa@sonerbygg.se");
  check("Outlook: ämnet", o.searchParams.get("subject") === meetingTitle(m));
}

// ── Kopplingen till dispositionen ──────────────────────────────────────────

const SLOTS: Slot[] = [
  { id: "fm", name: "Förmiddag", startMinute: 555, endMinute: 675, order: 1 },
  { id: "em", name: "Eftermiddag", startMinute: 795, endMinute: 885, order: 2 },
];
const CFG: SchedulerConfig = {
  maxAttempts: 8, maxRounds: 2, cooldownDays: 30, retryDaysNoSalespeople: 30,
  retryHoursNoAnswer: 20, retryBackoffFactor: 2, retryHoursMax: 336, retryHoursBusy: 2,
  retryHoursVoicemail: 44, retryHoursGatekeeper: 68, retryDaysNo: 60, blockedDates: [],
};
const base = { attemptCount: 2, roundCount: 0, noAnswerStreak: 3, triedSlotIds: [] as string[] };

console.log("\nSchemaläggaren");
{
  const at = new Date("2026-11-17T09:15:00Z");
  check("Möte bokat låser bolaget", claimsLead("MEETING_BOOKED"));
  const d = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "MEETING_BOOKED", meetingAt: at, slots: SLOTS, config: CFG, now: NU });
  check("nästa åtgärd = mötestiden (skyddsnät)", d.nextActionAt?.getTime() === at.getTime());
  check("inte pensionerat", !d.retired && d.retiredReason === null);
  check("ingen återkomst", d.callbackAt === null);
  check("låser", d.claimsLead);
  check("besvarat: obesvarade-serien nollas", d.noAnswerStreak === 0);
  check("försöket räknas", d.attemptCount === 3);
  const tak = computeNext({ lead: { ...base, attemptCount: 7, roundCount: 1 }, result: "CONNECTED_DM", outcome: "MEETING_BOOKED", meetingAt: at, slots: SLOTS, config: CFG, now: NU });
  check("möte på sista försöket pensionerar INTE som uttömt", !tak.retired, tak.retiredReason ?? "");
  const utan = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "MEETING_BOOKED", slots: SLOTS, config: CFG, now: NU });
  check("utan mötestid: ingen krasch, faller till normalfallet", !utan.retired && utan.nextActionAt !== null && utan.claimsLead);
  const nej = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "DM_NO", meetingAt: at, slots: SLOTS, config: CFG, now: NU });
  check("mötestid utan mötesutfall ignoreras (ett nej vilar 60 dagar)", (nej.nextActionAt?.getTime() ?? 0) > NU.getTime() + 59 * 86_400_000);
  const trasig = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "MEETING_BOOKED", meetingAt: new Date("x"), slots: SLOTS, config: CFG, now: NU });
  check("ogiltig mötestid ger aldrig ett ogiltigt datum på leadet", trasig.nextActionAt === null || !Number.isNaN(trasig.nextActionAt.getTime()));
}

console.log("\nFlödet: tangenterna");
{
  const keys = OUTCOME_OPTIONS.map((o) => o.key);
  check("inga dubbla tangenter", new Set(keys).size === keys.length);
  check("1–4 orörda", ["DM_NO", "CALLBACK_BOOKED", "SOLD", "WRONG_DM"].every((v, i) => OUTCOME_OPTIONS[i].value === v && OUTCOME_OPTIONS[i].key === String(i + 1)));
  check("5 = Möte bokat", optionForKey("outcome", "5")?.value === "MEETING_BOOKED");
  check("ingen följdfråga efter mötet (rutan tar över)", stageAfterOutcome("MEETING_BOOKED") === null);
  check("ingen ramverksfråga på ett möte", !shouldAskFramework("CONNECTED_DM", "MEETING_BOOKED"));
}

console.log("\nUtfallshinken i mappvyn");
{
  const RINGT = new Date("2026-11-13T10:00:00Z");
  check("Möte bokat → egen hink", utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: "MEETING_BOOKED" }).key === "mote");
  check("hinken ligger direkt efter såld", UTFALL_ORDNING.indexOf("mote") === UTFALL_ORDNING.indexOf("sald") + 1);
  check("långa etiketten", utfallText({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: "MEETING_BOOKED" }) === "Nådde beslutsfattaren · Möte bokat");
}

console.log("\nDäckets spegling — mappen ska säga samma sak som däcket");
{
  const lead = {
    retired: false, retiredReason: null, hasActiveDeal: false, attemptCount: 2,
    callbackAt: null, nextActionAt: null, lastAttemptAt: NU, hasPhone: true, dnc: null,
  };
  const at = new Date("2026-11-17T09:15:00Z");
  const s = deckState({ ...lead, meetingAt: at }, 8, NU);
  check("öppet möte → tillståndet möte", s.state === "meeting");
  check("etikett", deckStateLabel(s) === "Möte bokat");
  check("väntar på ett beslut, inte ur rotationen för gott", !isOutOfRotation(s));
  check("mötet före återkomsten", deckState({ ...lead, meetingAt: at, callbackAt: OM(30) }, 8, NU).state === "meeting");
  check("pensionerat går före mötet", deckState({ ...lead, meetingAt: at, retired: true, retiredReason: "sald" }, 8, NU).state === "retired");
  check("spärrlistan går före mötet", deckState({ ...lead, meetingAt: at, dnc: { expiresAt: null } }, 8, NU).state === "dnc");
  check("utan möte: oförändrat beteende", deckState(lead, 8, NU).state === "callable");
  check("meetingAt som ISO-sträng fungerar", deckState({ ...lead, meetingAt: at.toISOString() }, 8, NU).state === "meeting");
}

console.log(`\n${pass} godkända, ${fail} underkända\n`);
if (fail > 0) process.exit(1);
