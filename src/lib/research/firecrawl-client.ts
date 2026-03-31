import Firecrawl from "@mendable/firecrawl-js";

let _client: Firecrawl | null = null;

export function getFirecrawlClient(): Firecrawl {
  if (!_client) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY is not set");
    }
    _client = new Firecrawl({ apiKey });
  }
  return _client;
}

/**
 * Scrape a single URL and return clean Markdown.
 * Returns null on failure — never throws.
 */
export async function scrapeUrl(url: string): Promise<string | null> {
  try {
    const client = getFirecrawlClient();
    const result = await client.scrape(url, {
      formats: ["markdown"],
    });
    if (!result.markdown) return null;
    return result.markdown;
  } catch {
    return null;
  }
}

/**
 * Search the web via Firecrawl and return concatenated Markdown from top results.
 * Returns null on failure — never throws.
 */
export async function searchWeb(
  query: string,
  limit = 3
): Promise<string | null> {
  try {
    const client = getFirecrawlClient();
    const result = await client.search(query, {
      limit,
      scrapeOptions: { formats: ["markdown"] },
    });

    const results = result.web ?? [];
    if (!results.length) return null;

    return results
      .map((r) => {
        const doc = r as { markdown?: string; url?: string };
        return doc.markdown ? `## Source: ${doc.url ?? ""}\n\n${doc.markdown}` : "";
      })
      .filter(Boolean)
      .join("\n\n---\n\n");
  } catch {
    return null;
  }
}
