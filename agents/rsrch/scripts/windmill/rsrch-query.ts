
import * as wmill from "windmill-client";

export async function main(
  query: string,
  session?: string,
  name?: string,
  deep_research: boolean = false
) {
  const rsrchUrl = Deno.env.get("RSRCH_SERVER_URL") || "http://host.docker.internal:3001";

  console.log(`Running query: "${query}" (Session: ${session || "new"}, Deep: ${deep_research})`);

  try {
    const response = await fetch(`${rsrchUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bypass-windmill": "true", // Prevent infinite loop if server tries to route back
      },
      body: JSON.stringify({
        query,
        session,
        name,
        deepResearch: deep_research,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Query failed:", error);
    throw error;
  }
}
