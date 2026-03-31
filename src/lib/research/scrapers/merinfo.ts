import { searchWeb } from "../firecrawl-client";

/**
 * Scrape contact/org data from Merinfo.se via Firecrawl search.
 */
export async function scrapeMerinfo(companyName: string): Promise<string | null> {
  const query = `site:merinfo.se "${companyName}"`;
  return searchWeb(query, 2);
}
