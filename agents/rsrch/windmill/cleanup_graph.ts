/**
 * Windmill Script: Cleanup FalkorDB Graph
 *
 * This script removes stale and orphaned nodes from the graph.
 * Stale nodes are :PendingAudio nodes older than 7 days.
 * Orphaned nodes are any nodes with no relationships.
 *
 * @param dryRun - If true, the script will only report on the nodes
 *                 that would be deleted, without actually deleting them.
 */
// @ts-ignore
import { getGraphStore } from "../src/shared/graph-store";

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

  const store = getGraphStore();
  await store.connect(
    process.env.FALKORDB_HOST || "localhost",
    parseInt(process.env.FALKORDB_PORT || "6379", 10)
  );

  try {
    // 1. Cleanup stale :PendingAudio nodes (older than 7 days)
    const staleCount = await store.cleanupStalePendingAudios(7 * 24 * 60 * 60 * 1000, { dryRun });

    if (dryRun) {
        console.log(`[Dry Run] Found ${staleCount} stale :PendingAudio nodes.`);
    } else {
        console.log(`Deleted ${staleCount} stale :PendingAudio nodes.`);
    }

    // 2. Cleanup orphaned nodes (no relationships)
    // This functionality might not be in GraphStore yet, so we can add it or use raw query via store
    const orphanQuery = `
      MATCH (n)
      WHERE NOT (n)--()
      DETACH DELETE n
      RETURN count(n) as deleted
    `;
    const orphanResult = await store.executeQuery(orphanQuery);
    const deletedOrphans = (orphanResult.data?.[0] as any)?.deleted || 0;

    console.log(`Graph cleanup complete. Deleted ${staleCount} stale audios and ${deletedOrphans} orphans.`);

    return {
        deletedPendingAudio: staleCount,
        deletedOrphans: deletedOrphans,
        dryRun
    };

  } finally {
    await store.disconnect();
  }
}
