export type ConfidenceTier = "VERIFIED" | "INFERRED" | "ESTIMATED";

export interface DataPoint {
  value: string | number | null;
  confidence: ConfidenceTier;
  source_name: string;
  source_url?: string;
  scraped_at: string;
  quote?: string;
}

export interface ResearchRequest {
  company_name: string;
  org_number?: string;
  contact_name?: string;
  contact_title?: string;
  website?: string;
  meeting_at?: string;
}

export interface CompanyIntelligence {
  company_name: string;
  org_number: string | null;
  scraped_at: string;
  revenue_sek?: DataPoint;
  employees?: DataPoint;
  founded_year?: DataPoint;
  ceo?: DataPoint;
  address?: DataPoint;
  business_description?: DataPoint;
  recent_news?: DataPoint[];
  website_summary?: DataPoint;
  sales_signals?: DataPoint[];
}

export type ProgressiveMode = "full" | "bullets" | "minimal" | "stripped";

export interface FeatureKiller {
  feature: "auto-doc" | "pattern-recognition" | "just-ask";
  label: string;
  reason: string;
  confidence: ConfidenceTier;
}

export interface ObjectionCard {
  objection: string;
  response: string;
}

export interface BattleCard {
  job_id: string;
  company_name: string;
  generated_at: string;
  meeting_at?: string;

  stripped: {
    one_sentence: string;
    one_number: string;
    one_question: string;
  };

  hook: string;
  gap: string;
  math: string;
  killers: FeatureKiller[];
  bullets: string[];
  objection_prep: ObjectionCard[];

  data_freshness: "fresh" | "aging" | "stale";
  confidence_summary: {
    verified_count: number;
    inferred_count: number;
    estimated_count: number;
  };
}

export type JobStatus = "pending" | "scraping" | "analyzing" | "complete" | "failed";

export interface ResearchJob {
  job_id: string;
  status: JobStatus;
  status_detail?: string;
  request: ResearchRequest;
  intelligence?: CompanyIntelligence;
  card?: BattleCard;
  error?: string;
  created_at: string;
  completed_at?: string;
}
