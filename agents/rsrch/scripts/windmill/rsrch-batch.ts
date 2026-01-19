
import * as wmill from "windmill-client";

export async function main(
  queries: string[],
  concurrency: number = 1
) {
  const rsrchUrl = Deno.env.get("RSRCH_SERVER_URL") || "http://host.docker.internal:3001";

  console.log(`Processing batch of ${queries.length} queries with concurrency ${concurrency}`);

  const results: any[] = [];

  // Simple batch processing
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    console.log(`Processing batch ${Math.floor(i / concurrency) + 1}...`);

    const batchPromises = batch.map(async (q) => {
        try {
            const response = await fetch(`${rsrchUrl}/query`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-bypass-windmill": "true"
                },
                body: JSON.stringify({ query: q })
            });

            if (!response.ok) {
                return { query: q, error: `Status ${response.status}` };
            }
            return await response.json();
        } catch (e) {
            return { query: q, error: String(e) };
        }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return { results };
}
