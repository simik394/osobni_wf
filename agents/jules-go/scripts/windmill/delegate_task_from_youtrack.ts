
type Input = {
  issue_id: string;
}

export async function main(args: Input) {
  const { issue_id } = args;
  const YOUTRACK_URL = Deno.env.get("YOUTRACK_URL");
  const YOUTRACK_TOKEN = Deno.env.get("YOUTRACK_TOKEN");
  const JULES_API_KEY = Deno.env.get("JULES_API_KEY");

  // 1. Get Issue from YouTrack
  const issueResp = await fetch(`${YOUTRACK_URL}/api/issues/${issue_id}?fields=summary,description`, {
    headers: {
      "Authorization": `Bearer ${YOUTRACK_TOKEN}`,
      "Accept": "application/json"
    }
  });
  if (!issueResp.ok) throw new Error(`Failed to fetch issue: ${issueResp.statusText}`);
  const issue = await issueResp.json();

  // 2. Generate Prompt (simplified)
  const prompt = `Task: ${issue.summary}\n\nDescription:\n${issue.description}`;

  // 3. Create Session in Jules
  const sessionResp = await fetch("https://jules.googleapis.com/v1alpha/sessions", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": JULES_API_KEY!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      task: prompt
    })
  });
  if (!sessionResp.ok) throw new Error(`Failed to create session: ${sessionResp.statusText}`);
  const session = await sessionResp.json();

  // 4. Comment on Issue
  const comment = `Jules session created: ${session.name} (ID: ${session.id})`;
  await fetch(`${YOUTRACK_URL}/api/issues/${issue_id}/comments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${YOUTRACK_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: comment
    })
  });

  return { session_id: session.id, issue_id };
}
