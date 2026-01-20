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
import { FalkorDB } from "falkordb";

export async function main({
  dryRun = false,
}: {
  dryRun?: boolean;
}): Promise<{
  deletedPendingAudio: number;
  deletedOrphans: number;
  dryRun: boolean;
}> {
  let deletedPendingAudio = 0;
  let deletedOrphans = 0;

  console.log(`Starting graph cleanup. Dry run: ${dryRun}`);

  const client = await FalkorDB.connect({
    socket: {
      host: process.env.FALKORDB_HOST || "localhost",
      port: parseInt(process.env.FALKORDB_PORT || "6379", 10),
    },
  });

  try {
    const graph = client.selectGraph("rsrch");

    // 1. Cleanup stale :PendingAudio nodes (older than 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const stalePendingAudioQuery = `
      MATCH (pa:PendingAudio)
      WHERE pa.createdAt < $sevenDaysAgo
      RETURN pa.id as id
    `;
    const stalePendingAudioResult = await graph.query(stalePendingAudioQuery, {
      params: { sevenDaysAgo },
    });

    if (stalePendingAudioResult.data) {
      const ids = stalePendingAudioResult.data.map((row) => row.id as string);
      if (ids.length > 0) {
        if (dryRun) {
          console.log(
            `[Dry Run] Would delete ${ids.length} stale :PendingAudio nodes.`
          );
          deletedPendingAudio = ids.length;
        } else {
          const deleteQuery = `
            MATCH (pa:PendingAudio)
            WHERE pa.id IN $ids
            DETACH DELETE pa
          `;
          await graph.query(deleteQuery, { params: { ids } });
          console.log(`Deleted ${ids.length} stale :PendingAudio nodes.`);
          deletedPendingAudio = ids.length;
        }
      }
    }

    // 2. Cleanup orphaned nodes (no relationships)
    const orphanQuery = `
      MATCH (n)
      WHERE NOT (n)--()
      RETURN n.id as id
    `;
    const orphanResult = await graph.query(orphanQuery);

    if (orphanResult.data) {
      const ids = orphanResult.data.map((row) => row.id as string);
      if (ids.length > 0) {
        if (dryRun) {
          console.log(`[Dry Run] Would delete ${ids.length} orphaned nodes.`);
          deletedOrphans = ids.length;
        } else {
          const deleteQuery = `
            MATCH (n)
            WHERE n.id IN $ids
            DETACH DELETE n
          `;
          await graph.query(deleteQuery, { params: { ids } });
          console.log(`Deleted ${ids.length} orphaned nodes.`);
          deletedOrphans = ids.length;
        }
      }
    }
  } finally {
    await client.close();
  }

  console.log("Graph cleanup complete.");
  return {
    deletedPendingAudio,
    deletedOrphans,
    dryRun,
  };
}
