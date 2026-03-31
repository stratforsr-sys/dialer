import { NextRequest, NextResponse } from "next/server";
import { createJob, runResearchJob } from "@/lib/research/orchestrator";
import type { ResearchRequest } from "@/types/research";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResearchRequest;

    if (!body.company_name?.trim()) {
      return NextResponse.json(
        { error: "company_name is required" },
        { status: 400 }
      );
    }

    const job = createJob(body);

    // Kick off research without awaiting — return job_id immediately
    runResearchJob(job.job_id).catch(() => {
      // Errors are stored on the job object by the orchestrator
    });

    return NextResponse.json(
      { job_id: job.job_id, status: job.status },
      { status: 202 }
    );
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
