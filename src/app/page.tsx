"use client";

import { useState, useCallback, useEffect } from "react";
import type { Contact, CSVData, FieldMapping, ViewMode } from "@/types";
import { DEMO_CONTACTS } from "@/lib/constants";
import { useCallLists } from "@/hooks/useCallLists";
import { Sidebar } from "@/components/Sidebar";
import { ListsView } from "@/components/ListsView";
import { ImportView } from "@/components/ImportView";
import { MappingView } from "@/components/MappingView";
import { DashboardView } from "@/components/DashboardView";
import { ListView } from "@/components/ListView";
import { CockpitView } from "@/components/CockpitView";
import { StatsView } from "@/components/StatsView";
import { SettingsView } from "@/components/SettingsView";
import { ResearchView } from "@/components/ResearchView";

export default function Home() {
  const {
    callLists,
    activeList,
    activeListId,
    isLoaded,
    setActiveListId,
    createList,
    updateList,
    deleteList,
    updateContact,
    setContactStatus,
    moveContacts,
  } = useCallLists();

  const [view, setView] = useState<ViewMode>("lists");
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [importFileName, setImportFileName] = useState("");
  const [cockpitIndex, setCockpitIndex] = useState(0);
  const [sessionCalls, setSessionCalls] = useState(0);
  const [sessionMeetings, setSessionMeetings] = useState(0);

  // Derived state
  const contacts = activeList?.contacts || [];
  const listName = activeList?.name || "";
  const hasData = activeList !== null && contacts.length > 0;

  // On load: if no lists at all, show import; otherwise show lists panel
  useEffect(() => {
    if (!isLoaded) return;
    if (callLists.length === 0) {
      setView("import");
    }
    // else keep "lists" as default (already the initial state)
  }, [isLoaded, callLists.length]);

  // Select list and go to dashboard
  const handleSelectList = useCallback((listId: string) => {
    setActiveListId(listId);
    setView("dashboard");
    setCockpitIndex(0);
  }, [setActiveListId]);

  // Select list and start dialer immediately
  const handleStartDialerForList = useCallback((listId: string) => {
    setActiveListId(listId);
    // find first uncalled contact in that list
    const list = callLists.find(l => l.id === listId);
    if (list) {
      const idx = list.contacts.findIndex(c => c.status === "ej_ringd");
      setCockpitIndex(idx >= 0 ? idx : 0);
    }
    setView("cockpit");
  }, [callLists, setActiveListId]);

  const handleImportReady = useCallback((data: CSVData, guessedMapping: FieldMapping, fileName: string) => {
    setCsvData(data);
    setMapping(guessedMapping);
    setImportFileName(fileName);
    setView("mapping");
  }, []);

  const handleMappingConfirm = useCallback((listNameInput: string) => {
    if (!csvData) return;
    const imported: Contact[] = csvData.rows.map((row) => {
      const c: Contact = {
        id: crypto.randomUUID(),
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

    createList(listNameInput || "Ny ringlista", imported);
    setCsvData(null);
    setMapping({});
    setImportFileName("");
    setView("lists");
  }, [csvData, mapping, createList]);

  const handleLoadDemo = useCallback(() => {
    createList("Demo - SaaS-leads", DEMO_CONTACTS);
    setView("lists");
  }, [createList]);

  const handleUpdateContact = useCallback((id: string, updates: Partial<Contact>) => {
    updateContact(id, updates);
  }, [updateContact]);

  const handleSetStatus = useCallback((id: string, status: Contact["status"]) => {
    setContactStatus(id, status);
    setSessionCalls(p => p + 1);
    if (status === "bokat_mote") setSessionMeetings(p => p + 1);
  }, [setContactStatus]);

  const handleSkipContact = useCallback((id: string) => {
    setContactStatus(id, "hoppat_over");
    // Intentionally NOT incrementing sessionCalls
  }, [setContactStatus]);

  const handleMoveContact = useCallback((contactId: string, toListId: string) => {
    if (!activeListId) return;
    moveContacts([contactId], activeListId, toListId);
  }, [activeListId, moveContacts]);

  const startDialer = useCallback((startIndex?: number) => {
    const idx = startIndex ?? contacts.findIndex(c => c.status === "ej_ringd");
    setCockpitIndex(idx >= 0 ? idx : 0);
    setView("cockpit");
  }, [contacts]);

  const handleDeleteList = useCallback((listId: string) => {
    deleteList(listId);
    if (callLists.length <= 1) {
      setView("import");
    } else {
      setView("lists");
    }
  }, [deleteList, callLists.length]);

  const handleRenameList = useCallback((listId: string, newName: string) => {
    updateList(listId, { name: newName });
  }, [updateList]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-telink-bg">
        <div className="text-telink-muted">Laddar...</div>
      </div>
    );
  }

  const showSidebar = view !== "cockpit";

  return (
    <div className="flex h-screen overflow-hidden">
      {showSidebar && (
        <Sidebar
          view={view}
          setView={setView}
          hasData={hasData}
          activeListName={activeList?.name}
        />
      )}
      <main className="flex-1 overflow-hidden">
        {view === "lists" && (
          <ListsView
            callLists={callLists}
            activeListId={activeListId}
            onSelectList={handleSelectList}
            onStartDialer={handleStartDialerForList}
            onDeleteList={handleDeleteList}
            onRenameList={handleRenameList}
            onImportNew={() => setView("import")}
          />
        )}
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
            defaultListName={importFileName.replace(/\.(csv|xlsx|xls|tsv|txt)$/i, "") || "Ny ringlista"}
            onConfirm={handleMappingConfirm}
            onBack={() => setView("import")}
          />
        )}
        {view === "dashboard" && activeList && (
          <DashboardView
            contacts={contacts}
            sessionCalls={sessionCalls}
            sessionMeetings={sessionMeetings}
            listName={listName}
            onStartDialer={() => startDialer()}
            onGoToList={() => setView("list")}
          />
        )}
        {view === "list" && activeList && (
          <ListView
            contacts={contacts}
            callLists={callLists}
            activeListId={activeListId}
            onStartDialer={startDialer}
            onOpenCockpit={(idx) => { setCockpitIndex(idx); setView("cockpit"); }}
            onMoveContact={handleMoveContact}
          />
        )}
        {view === "cockpit" && activeList && (
          <CockpitView
            contacts={contacts}
            currentIndex={cockpitIndex}
            setCurrentIndex={setCockpitIndex}
            setStatus={handleSetStatus}
            onSkip={handleSkipContact}
            updateContact={handleUpdateContact}
            onExit={() => setView("dashboard")}
            onNavigate={setView}
            sessionCalls={sessionCalls}
          />
        )}
        {view === "stats" && activeList && (
          <StatsView
            contacts={contacts}
            callLists={callLists}
            sessionCalls={sessionCalls}
            sessionMeetings={sessionMeetings}
          />
        )}
        {view === "settings" && (
          <SettingsView
            onExportData={() => {
              const data = JSON.stringify(callLists, null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "telink-export.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
            onClearData={() => {
              callLists.forEach(list => deleteList(list.id));
              setView("import");
            }}
          />
        )}
        {view === "research" && (
          <ResearchView />
        )}
        {/* Fallback: data-dependent views with no active list → go to lists */}
        {!activeList && !["lists", "import", "mapping", "settings", "research"].includes(view) && (
          <ListsView
            callLists={callLists}
            activeListId={activeListId}
            onSelectList={handleSelectList}
            onStartDialer={handleStartDialerForList}
            onDeleteList={handleDeleteList}
            onRenameList={handleRenameList}
            onImportNew={() => setView("import")}
          />
        )}
      </main>
    </div>
  );
}
