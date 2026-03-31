import { searchWeb } from "../firecrawl-client";

/**
 * Find recent news about the company from Swedish and general sources.
 */
export async function scrapeNews(companyName: string): Promise<string | null> {
  // Swedish tech/business news
  const breakitQuery = `"${companyName}" site:breakit.se OR site:di.se OR site:resume.se`;
  const breakitResult = await searchWeb(breakitQuery, 2);

  // General news + hiring signals
  const generalQuery = `"${companyName}" (finansiering OR nyhet OR expansion OR rekrytering OR "ny vd")`;
  const generalResult = await searchWeb(generalQuery, 2);

  const parts = [breakitResult, generalResult].filter(Boolean);
  return parts.length ? parts.join("\n\n---\n\n") : null;
}
