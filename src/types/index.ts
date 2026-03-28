export type ContactStatus =
  | "ej_ringd"
  | "svarar_ej"
  | "nej_tack"
  | "bokat_mote"
  | "upptaget"
  | "fel_nummer"
  | "atersam"
  | "intresserad"
  | "klar";

export interface Contact {
  id: string;
  name: string;
  company: string;
  role: string;
  direct_phone: string;
  switchboard: string;
  email: string;
  website: string;
  linkedin: string;
  org_number: string;
  status: ContactStatus;
  notes: string;
  tags: string[];
  lastContact: string | null;
}

export interface CallList {
  id: string;
  name: string;
  contacts: Contact[];
  createdAt: string;
  updatedAt: string;
  stats: {
    totalCalls: number;
    totalMeetings: number;
  };
}

export type SystemFieldKey =
  | "name"
  | "company"
  | "role"
  | "direct_phone"
  | "switchboard"
  | "email"
  | "website"
  | "linkedin"
  | "org_number"
  | "skip";

export interface FieldMapping {
  [csvColumn: string]: SystemFieldKey;
}

export interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
}

export type ViewMode = "import" | "mapping" | "dashboard" | "list" | "cockpit";
