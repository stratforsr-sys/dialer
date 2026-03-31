import { scrapeUrl, searchWeb } from "../firecrawl-client";

/**
 * Scrape company financials from Allabolag.se.
 * Tries direct URL first (by org number), then falls back to search.
 */
export async function scrapeAllabolag(
  companyName: string,
  orgNumber?: string
): Promise<string | null> {
  // Try direct URL by org number (most reliable)
  if (orgNumber) {
    const cleaned = orgNumber.replace(/[-\s]/g, "");
    const directUrl = `https://www.allabolag.se/${cleaned}`;
    const result = await scrapeUrl(directUrl);
    if (result && result.length > 200) return result;
  }

  // Fallback: search via Firecrawl
  const query = `site:allabolag.se "${companyName}"`;
  return searchWeb(query, 2);
}
