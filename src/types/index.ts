export type ContactStatus =
  | "ej_ringd"
  | "svarar_ej"
  | "nej_tack"
  | "bokat_mote"
  | "upptaget"
  | "fel_nummer"
  | "atersam"
  | "intresserad"
  | "klar"
  | "hoppat_over";

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
  | "first_name"
  | "last_name"
  | "company"
  | "role"
  | "address"
  | "city"
  | "industry"
  | "industry_code"
  | "employees"
  | "revenue"
  | "direct_phone"
  | "switchboard"
  | "email"
  | "website"
  | "linkedin"
  | "org_number"
  // SEO-uppgifter ur en redan berikad fil. Lagras som LeadClaim, inte som
  // kolumner på Lead: de har en källa och en färskhet som måste följa med,
  // och en placering från i mars är inte samma påstående som en från i går.
  | "seo_rank"
  | "seo_keyword"
  | "seo_competitor"
  | "seo_top3"
  | "seo_rivals"
  | "seo_services"
  | "gmb_rating"
  | "gmb_reviews"
  | "gmb_category"
  | "skip";

export interface FieldMapping {
  [csvColumn: string]: SystemFieldKey;
}

export interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
}

export type ViewMode = "lists" | "import" | "mapping" | "dashboard" | "list" | "cockpit" | "stats" | "settings" | "research";

export interface AppSettings {
  dailyCallGoal: number;
  dailyMeetingGoal: number;
}

export interface DayStats {
  date: string; // "2026-04-01"
  calls: number;
  meetings: number;
  byList: Record<string, number>;
}
