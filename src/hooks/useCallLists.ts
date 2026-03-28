"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { CallList, Contact, ContactStatus } from "@/types";

const STORAGE_KEY = "telink_call_lists";
const ACTIVE_LIST_KEY = "telink_active_list_id";

function generateId(): string {
  return crypto.randomUUID();
}

function loadFromStorage(): CallList[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveToStorage(lists: CallList[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      console.error("localStorage quota exceeded");
    }
    return false;
  }
}

function loadActiveListId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_LIST_KEY);
}

function saveActiveListId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(ACTIVE_LIST_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_LIST_KEY);
  }
}

export function useCallLists() {
  const [callLists, setCallLists] = useState<CallList[]>([]);
  const [activeListId, setActiveListIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const lists = loadFromStorage();
    const savedActiveId = loadActiveListId();
    setCallLists(lists);

    // Validate that saved active ID still exists
    if (savedActiveId && lists.some(l => l.id === savedActiveId)) {
      setActiveListIdState(savedActiveId);
    } else if (lists.length > 0) {
      setActiveListIdState(lists[0].id);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when lists change
  useEffect(() => {
    if (isLoaded) {
      saveToStorage(callLists);
    }
  }, [callLists, isLoaded]);

  // Save active list ID when it changes
  useEffect(() => {
    if (isLoaded) {
      saveActiveListId(activeListId);
    }
  }, [activeListId, isLoaded]);

  const activeList = useMemo(() => {
    return callLists.find(l => l.id === activeListId) || null;
  }, [callLists, activeListId]);

  const setActiveListId = useCallback((id: string | null) => {
    setActiveListIdState(id);
  }, []);

  const createList = useCallback((name: string, contacts: Contact[]): CallList => {
    const now = new Date().toISOString();
    const newList: CallList = {
      id: generateId(),
      name,
      contacts,
      createdAt: now,
      updatedAt: now,
      stats: {
        totalCalls: 0,
        totalMeetings: 0,
      },
    };
    setCallLists(prev => [...prev, newList]);
    setActiveListIdState(newList.id);
    return newList;
  }, []);

  const updateList = useCallback((id: string, updates: Partial<Omit<CallList, "id" | "createdAt">>) => {
    setCallLists(prev => prev.map(list => {
      if (list.id !== id) return list;
      return {
        ...list,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const deleteList = useCallback((id: string) => {
    setCallLists(prev => {
      const newLists = prev.filter(l => l.id !== id);
      // If we deleted the active list, switch to another
      if (activeListId === id) {
        const nextList = newLists[0];
        setActiveListIdState(nextList?.id || null);
      }
      return newLists;
    });
  }, [activeListId]);

  const updateContact = useCallback((contactId: string, updates: Partial<Contact>) => {
    if (!activeListId) return;
    setCallLists(prev => prev.map(list => {
      if (list.id !== activeListId) return list;
      return {
        ...list,
        contacts: list.contacts.map(c =>
          c.id === contactId ? { ...c, ...updates } : c
        ),
        updatedAt: new Date().toISOString(),
      };
    }));
  }, [activeListId]);

  const setContactStatus = useCallback((contactId: string, status: ContactStatus) => {
    if (!activeListId) return;
    const now = new Date().toISOString();
    setCallLists(prev => prev.map(list => {
      if (list.id !== activeListId) return list;
      const isMeeting = status === "bokat_mote";
      return {
        ...list,
        contacts: list.contacts.map(c =>
          c.id === contactId ? { ...c, status, lastContact: now } : c
        ),
        stats: {
          totalCalls: list.stats.totalCalls + 1,
          totalMeetings: list.stats.totalMeetings + (isMeeting ? 1 : 0),
        },
        updatedAt: now,
      };
    }));
  }, [activeListId]);

  const moveContacts = useCallback((contactIds: string[], fromListId: string, toListId: string) => {
    setCallLists(prev => {
      const fromList = prev.find(l => l.id === fromListId);
      if (!fromList) return prev;

      const contactsToMove = fromList.contacts.filter(c => contactIds.includes(c.id));
      if (contactsToMove.length === 0) return prev;

      const now = new Date().toISOString();
      return prev.map(list => {
        if (list.id === fromListId) {
          return {
            ...list,
            contacts: list.contacts.filter(c => !contactIds.includes(c.id)),
            updatedAt: now,
          };
        }
        if (list.id === toListId) {
          return {
            ...list,
            contacts: [...list.contacts, ...contactsToMove],
            updatedAt: now,
          };
        }
        return list;
      });
    });
  }, []);

  return {
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
  };
}
