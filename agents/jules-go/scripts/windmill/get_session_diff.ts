
type Input = {
  session_id: string;
  repo_url: string;
}

export async function main(args: Input) {
  const { session_id, repo_url } = args;
  const tmpDir = await Deno.makeTempDir();

  try {
    console.log(`Cloning ${repo_url} into ${tmpDir}...`);

    const cloneCmd = new Deno.Command("git", {
      args: ["clone", repo_url, "."],
      cwd: tmpDir,
    });
    const cloneOutput = await cloneCmd.output();
    if (!cloneOutput.success) {
      throw new Error(`Git clone failed: ${new TextDecoder().decode(cloneOutput.stderr)}`);
    }

    // Assuming 'jules remote pull' is available in the environment
    console.log(`Pulling session ${session_id}...`);

    // We assume 'jules' is in the PATH
    const pullCmd = new Deno.Command("jules", {
        args: ["remote", "pull", session_id],
        cwd: tmpDir,
    });
    const pullOutput = await pullCmd.output();
    if (!pullOutput.success) {
         throw new Error(`Jules pull failed: ${new TextDecoder().decode(pullOutput.stderr)}`);
    }

    console.log("Generating diff...");
    const diffCmd = new Deno.Command("git", {
        args: ["diff"],
        cwd: tmpDir,
    });
    const diffOutput = await diffCmd.output();
    if (!diffOutput.success) {
        throw new Error(`Git diff failed: ${new TextDecoder().decode(diffOutput.stderr)}`);
    }

    return new TextDecoder().decode(diffOutput.stdout);
  } catch (error) {
    console.error("Error generating diff:", error);
    throw error;
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch (e) {
      console.error("Failed to cleanup temp dir:", e);
    }
  }
}
