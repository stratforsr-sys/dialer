import { scrapeUrl, searchWeb } from "../firecrawl-client";

/**
 * Scrape the company's own website for USPs, product description, and signals.
 * Uses the website field from the contact if available.
 */
export async function scrapeWebsite(
  companyName: string,
  websiteUrl?: string
): Promise<string | null> {
  if (websiteUrl) {
    const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const result = await scrapeUrl(url);
    if (result && result.length > 200) return result;
  }

  // Fallback: find their website via search
  const query = `"${companyName}" officiell hemsida -allabolag -merinfo`;
  return searchWeb(query, 1);
}
