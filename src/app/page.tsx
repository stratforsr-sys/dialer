"use client";

import { useState, useCallback } from "react";
import type { Contact, CSVData, FieldMapping, ViewMode, ContactStatus } from "@/types";
import { DEMO_CONTACTS } from "@/lib/constants";
import { Sidebar } from "@/components/Sidebar";
import { ImportView } from "@/components/ImportView";
import { MappingView } from "@/components/MappingView";
import { DashboardView } from "@/components/DashboardView";
import { ListView } from "@/components/ListView";
import { CockpitView } from "@/components/CockpitView";

export default function Home() {
  const [view, setView] = useState<ViewMode>("import");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [cockpitIndex, setCockpitIndex] = useState(0);
  const [sessionCalls, setSessionCalls] = useState(0);
  const [sessionMeetings, setSessionMeetings] = useState(0);
  const [listName, setListName] = useState("Ny ringlista");

  const handleImportReady = useCallback((data: CSVData, guessedMapping: FieldMapping) => {
    setCsvData(data);
    setMapping(guessedMapping);
    setView("mapping");
  }, []);

  const handleMappingConfirm = useCallback(() => {
    if (!csvData) return;
    const imported: Contact[] = csvData.rows.map((row, i) => {
      const c: Contact = {
        id: i + 1,
        name: "", company: "", role: "", direct_phone: "", switchboard: "",
        email: "", website: "", linkedin: "", org_number: "",
        status: "ej_ringd", notes: "", tags: [], lastContact: null,
      };
      Object.entries(mapping).forEach(([csvCol, sysField]) => {
        if (sysField !== "skip" && sysField in c) {
          (c as unknown as Record<string, string>)[sysField] = row[csvCol] || "";
        }
      });
      return c;
    }).filter(c => c.name || c.company || c.direct_phone);

    setContacts(imported);
    setView("dashboard");
  }, [csvData, mapping]);

  const handleLoadDemo = useCallback(() => {
    setContacts(DEMO_CONTACTS);
    setListName("SaaS 2 — Demo");
    setView("dashboard");
  }, []);

  const updateContact = useCallback((id: number, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const setStatus = useCallback((id: number, status: ContactStatus) => {
    const now = new Date().toISOString();
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status, lastContact: now } : c));
    setSessionCalls(p => p + 1);
    if (status === "bokat_mote") setSessionMeetings(p => p + 1);
  }, []);

  const startDialer = useCallback((startIndex?: number) => {
    const idx = startIndex ?? contacts.findIndex(c => c.status === "ej_ringd");
    setCockpitIndex(idx >= 0 ? idx : 0);
    setView("cockpit");
  }, [contacts]);

  const hasData = contacts.length > 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        view={view}
        setView={setView}
        hasData={hasData}
        listName={listName}
        contactCount={contacts.length}
      />
      <main className="flex-1 overflow-hidden">
        {view === "import" && (
          <ImportView
            onImportReady={handleImportReady}
            onLoadDemo={handleLoadDemo}
          />
        )}
        {view === "mapping" && csvData && (
          <MappingView
            csvData={csvData}
            mapping={mapping}
            setMapping={setMapping}
            onConfirm={handleMappingConfirm}
            onBack={() => setView("import")}
          />
        )}
        {view === "dashboard" && (
          <DashboardView
            contacts={contacts}
            sessionCalls={sessionCalls}
            sessionMeetings={sessionMeetings}
            listName={listName}
            onStartDialer={() => startDialer()}
            onGoToList={() => setView("list")}
          />
        )}
        {view === "list" && (
          <ListView
            contacts={contacts}
            onStartDialer={startDialer}
            onOpenCockpit={(idx) => { setCockpitIndex(idx); setView("cockpit"); }}
          />
        )}
        {view === "cockpit" && (
          <CockpitView
            contacts={contacts}
            currentIndex={cockpitIndex}
            setCurrentIndex={setCockpitIndex}
            setStatus={setStatus}
            updateContact={updateContact}
            onExit={() => setView("dashboard")}
            sessionCalls={sessionCalls}
          />
        )}
      </main>
    </div>
  );
}
