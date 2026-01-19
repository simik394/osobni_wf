
import * as wmill from "windmill-client";

export async function main(
  query: string,
  gem?: string,
  session_id?: string
) {
  const rsrchUrl = Deno.env.get("RSRCH_SERVER_URL") || "http://host.docker.internal:3001";

  console.log(`Starting deep research for: "${query}"`);

  try {
    const response = await fetch(`${rsrchUrl}/deep-research/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bypass-windmill": "true"
      },
      body: JSON.stringify({
        query,
        gem,
        sessionId: session_id
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Deep research trigger failed:", error);
    throw error;
  }
}
