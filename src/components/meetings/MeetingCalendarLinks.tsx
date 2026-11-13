"use client";

import { useMemo } from "react";
import {
  outlookCalendarUrl,
  googleCalendarUrl,
  icsDataUrl,
  icsFileName,
  type CalendarMeeting,
} from "@/lib/kalender";

/**
 * "Lägg i kalendern" — tre länkar, ingen server.
 *
 * Inbjudan till kunden skickas av säljaren från sin egen kalender, inte av
 * dialern. Se `lib/kalender.ts` för varför.
 */
export function MeetingCalendarLinks({
  meeting,
  size = "sm",
}: {
  meeting: CalendarMeeting;
  size?: "sm" | "xs";
}) {
  const links = useMemo(
    () => ({
      outlook: outlookCalendarUrl(meeting),
      google: googleCalendarUrl(meeting),
      ics: icsDataUrl(meeting),
      file: icsFileName(meeting),
    }),
    [meeting]
  );
  const cls = size === "xs" ? "text-[11px] px-2 py-[3px]" : "text-[12px] px-2.5 py-1";
  const style: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    borderRadius: "var(--r-sm)",
  };
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <a href={links.outlook} target="_blank" rel="noopener noreferrer" className={cls} style={style}
         title="Öppnar ett ifyllt möte i Outlook — slå på Teams och skicka inbjudan därifrån">
        Outlook
      </a>
      <a href={links.google} target="_blank" rel="noopener noreferrer" className={cls} style={style}
         title="Öppnar ett ifyllt möte i Google Kalender">
        Google
      </a>
      <a href={links.ics} download={links.file} className={cls} style={style}
         title="Kalenderfil för Outlook på datorn, Apple Kalender m.fl.">
        .ics
      </a>
    </span>
  );
}
