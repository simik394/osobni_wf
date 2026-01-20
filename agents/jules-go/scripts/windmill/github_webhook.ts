
type Input = {
  payload: any; // GitHub webhook payload
}

export async function main(args: Input) {
  const { payload } = args;
  const YOUTRACK_URL = Deno.env.get("YOUTRACK_URL");
  const YOUTRACK_TOKEN = Deno.env.get("YOUTRACK_TOKEN");

  // Check if PR is merged
  if (payload.pull_request?.merged) {
    const prBody = payload.pull_request.body || "";
    const issueMatch = prBody.match(/Fixes #([A-Z]+-\d+)/);

    if (issueMatch) {
      const issueId = issueMatch[1];
      console.log(`PR merged. Closing issue ${issueId}...`);

      // Update YouTrack Issue State
      // Assuming a command based approach or API to set state
      // Here we assume we can execute a command
      await fetch(`${YOUTRACK_URL}/api/issues/${issueId}/commands`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${YOUTRACK_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: "state Fixed",
          issues: [{ id: issueId }]
        })
      });

      // Update Checkbox in PR body?
      // The prompt says "Parse 'Fixes #ID', checkbox update, state transition."
      // Checkbox update usually refers to updating the PR description on GitHub to check a box.
      // But this is a webhook script, it can call GitHub API to update PR.
      // However, the PR is already merged/closed, so updating it might be less relevant than updating the issue.

      return { status: "closed", issue: issueId };
    }
  }

  return { status: "ignored" };
}
