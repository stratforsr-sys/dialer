import type { ResearchJob, ResearchRequest } from "@/types/research";
import { scrapeAllabolag } from "./scrapers/allabolag";
import { scrapeMerinfo } from "./scrapers/merinfo";
import { scrapeNews } from "./scrapers/news";
import { scrapeWebsite } from "./scrapers/website";
import { synthesizeBattleCard } from "./synthesizer";
import { nanoid } from "./utils";

// In-memory job store (survives hot reload, resets on cold start)
const jobs = new Map<string, ResearchJob>();

export function getJob(jobId: string): ResearchJob | undefined {
  return jobs.get(jobId);
}

export function createJob(request: ResearchRequest): ResearchJob {
  const job: ResearchJob = {
    job_id: nanoid(),
    status: "pending",
    status_detail: "Startar research...",
    request,
    created_at: new Date().toISOString(),
  };
  jobs.set(job.job_id, job);
  return job;
}

function updateJob(jobId: string, updates: Partial<ResearchJob>) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, ...updates });
}

export async function runResearchJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  const { request } = job;

  try {
    // Phase 1: Scraping (all 4 sources in parallel)
    updateJob(jobId, {
      status: "scraping",
      status_detail: "Skannar Allabolag, Merinfo, nyheter och hemsida...",
    });

    const [allabolagData, merinfoData, newsData, websiteData] =
      await Promise.allSettled([
        scrapeAllabolag(request.company_name, request.org_number),
        scrapeMerinfo(request.company_name),
        scrapeNews(request.company_name),
        scrapeWebsite(request.company_name, request.website),
      ]);

    const rawData: Record<string, string | null> = {
      allabolag:
        allabolagData.status === "fulfilled" ? allabolagData.value : null,
      merinfo: merinfoData.status === "fulfilled" ? merinfoData.value : null,
      news: newsData.status === "fulfilled" ? newsData.value : null,
      website: websiteData.status === "fulfilled" ? websiteData.value : null,
    };

    const sourcesFound = Object.values(rawData).filter(Boolean).length;

    // Phase 2: Synthesis via Claude Sonnet
    updateJob(jobId, {
      status: "analyzing",
      status_detail: `Bygger battle card (${sourcesFound}/4 källor hittade)...`,
    });

    const card = await synthesizeBattleCard(rawData, request, jobId);

    updateJob(jobId, {
      status: "complete",
      status_detail: "Klar",
      card,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    updateJob(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Okänt fel",
    });
  }
}
