
import * as wmill from "windmill-client";

export async function main(
  notebook_title: string,
  sources: string[],
  custom_prompt?: string,
  dry_run: boolean = false
) {
  const rsrchUrl = Deno.env.get("RSRCH_SERVER_URL") || "http://host.docker.internal:3001";

  console.log(`Generating audio for notebook "${notebook_title}" with ${sources.length} sources`);

  // We call the server's generate-audio endpoint
  // IMPORTANT: We must pass x-bypass-windmill header to prevent the server
  // from trying to queue this job back to Windmill!

  try {
    const response = await fetch(`${rsrchUrl}/notebook/generate-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bypass-windmill": "true"
      },
      body: JSON.stringify({
        notebookTitle: notebook_title,
        sources: sources,
        customPrompt: custom_prompt,
        dryRun: dry_run
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Audio generation failed:", error);
    throw error;
  }
}
