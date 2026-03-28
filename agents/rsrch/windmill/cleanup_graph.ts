/**
 * Windmill Script: Cleanup FalkorDB Graph
 *
 * This script removes stale and orphaned nodes from the graph.
 * Uses the centralized GraphStore service for all operations.
 */
import { GraphStore } from "../src/core/graph-store";
import { config } from "../src/config";

export async function main({
  dryRun = false,
}: {
  dryRun?: boolean;
}): Promise<{
  deletedPendingAudio: number;
  deletedOrphans: number;
  dryRun: boolean;
}> {
  console.log(`Starting graph cleanup. Dry run: ${dryRun}`);

  const store = new GraphStore();
  
  try {
    // 1. Connect to GraphStore
    await store.connect(config.falkor.host, config.falkor.port);

    // 2. Cleanup stale :PendingAudio nodes (older than 7 days)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const deletedPendingAudio = await store.cleanupStalePendingAudios(sevenDaysMs, dryRun);
    if (dryRun) {
        console.log(`[Dry Run] Would delete ${deletedPendingAudio} stale :PendingAudio nodes.`);
    } else {
        console.log(`Deleted ${deletedPendingAudio} stale :PendingAudio nodes.`);
    }

    // 3. Cleanup orphaned nodes (no relationships)
    const deletedOrphans = await store.cleanupOrphanedNodes(dryRun);
    if (dryRun) {
        console.log(`[Dry Run] Would delete ${deletedOrphans} orphaned nodes.`);
    } else {
        console.log(`Deleted ${deletedOrphans} orphaned nodes.`);
    }

    console.log("Graph cleanup complete.");
    
    return {
      deletedPendingAudio,
      deletedOrphans,
      dryRun,
    };

  } catch (error: any) {
    console.error("Graph cleanup failed:", error);
    throw error;
  } finally {
    await store.disconnect();
  }
}
