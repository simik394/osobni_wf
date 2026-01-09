/**
 * Windmill Flow Template: FalkorDB State Sync
 *
 * This template provides a pattern for synchronizing data from a source to FalkorDB
 * while maintaining state between runs. This allows for incremental updates,
 * fetching only what has changed since the last sync.
 *
 * Features:
 * - Stateful execution using Windmill's `wmill.getState` and `wmill.setState`.
 * - Idempotent operations to ensure data consistency.
 * - Placeholder for fetching data based on the last sync timestamp.
 * - Placeholder for transforming and upserting data into FalkorDB.
 *
 * How to use this template:
 * 1. Implement the `fetchUpdatesFromSource` function to get new/updated data.
 *    - Use the `lastSyncTimestamp` to fetch incrementally.
 * 2. Implement the `upsertToFalkorDB` function to map your data to Cypher queries.
 *    - Use MERGE queries for idempotency.
 * 3. Adapt the `State` type definition to store any other necessary metadata.
 */

import * as wmill from "windmill-client";

// Define the structure of your state object
type State = {
  lastSyncTimestamp: string;
  processedIds?: string[]; // Example of other stateful data
};

// Define the structure of the data you're syncing
type SourceData = {
  id: string;
  name: string;
  updatedAt: string;
  properties: Record<string, any>;
  relations: { targetId: string; type: string }[];
};

/**
 * Fetches new or updated data from the source since the last sync.
 *
 * @param lastSyncTimestamp - The ISO 8601 timestamp of the last successful sync.
 * @returns A promise that resolves to an array of source data.
 */
async function fetchUpdatesFromSource(lastSyncTimestamp: string): Promise<SourceData[]> {
  // --- Replace with your data fetching logic ---
  // Example: Fetching from a hypothetical API
  const apiUrl = `https://api.example.com/updates?since=${lastSyncTimestamp}`;
  console.log(`Fetching updates from: ${apiUrl}`);

  // const response = await fetch(apiUrl);
  // if (!response.ok) {
  //   throw new Error(`API request failed: ${response.statusText}`);
  // }
  // const data = await response.json();
  // return data.updates;
  // --- End of replacement section ---

  // Mock data for demonstration purposes
  const mockData: SourceData[] = [
    {
      id: "user:123",
      name: "Alice",
      updatedAt: new Date().toISOString(),
      properties: { email: "alice@example.com", status: "active" },
      relations: [{ targetId: "group:A", type: "MEMBER_OF" }],
    },
    {
      id: "user:456",
      name: "Bob",
      updatedAt: new Date().toISOString(),
      properties: { email: "bob@example.com", status: "inactive" },
      relations: [{ targetId: "group:A", type: "MEMBER_OF" }],
    },
  ];

  return Promise.resolve(mockData);
}

/**
 * Upserts a batch of data into FalkorDB using idempotent MERGE queries.
 *
 * @param falkorDB - A FalkorDB connection resource (replace with your actual resource type).
 * @param data - The data to be upserted.
 */
async function upsertToFalkorDB(
  // falkorDB: RT.FalkorDB, // Replace with your FalkorDB resource type
  data: SourceData[]
): Promise<{ nodesCreated: number; relationshipsCreated: number }> {
  let nodesCreated = 0;
  let relationshipsCreated = 0;

  console.log(`Upserting ${data.length} items to FalkorDB...`);

  for (const item of data) {
    // --- Replace with your FalkorDB upsert logic ---
    // This example uses MERGE for idempotency.
    // It assumes a simple "Node" label and uses the item's id as a unique key.

    // 1. Merge the node
    const nodeQuery = `
      MERGE (n:Node {id: '${item.id}'})
      ON CREATE SET n.name = '${item.name}', n += $properties
      ON MATCH SET n.name = '${item.name}', n += $properties
    `;
    // In a real scenario, you would execute this query against FalkorDB.
    // e.g., await falkorDB.query(nodeQuery, { properties: item.properties });
    nodesCreated++;

    // 2. Merge relationships
    for (const rel of item.relations) {
      const relQuery = `
        MATCH (source:Node {id: '${item.id}'})
        MATCH (target:Node {id: '${rel.targetId}'})
        MERGE (source)-[r:${rel.type}]->(target)
      `;
      // e.g., await falkorDB.query(relQuery);
      relationshipsCreated++;
    }
    // --- End of replacement section ---
  }

  // Mock execution
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log(`Upsert complete. Nodes: ${nodesCreated}, Relationships: ${relationshipsCreated}`);
  return { nodesCreated, relationshipsCreated };
}

export async function main() {
  const jobStartTime = new Date();

  // 1. Retrieve the last state from Windmill
  const previousState: State | undefined = await wmill.getState();
  const lastSyncTimestamp = previousState?.lastSyncTimestamp || new Date(0).toISOString();

  console.log(`Starting sync. Last sync timestamp: ${lastSyncTimestamp}`);

  try {
    // 2. Fetch updates from the source since the last sync
    const updates = await fetchUpdatesFromSource(lastSyncTimestamp);

    if (updates.length === 0) {
      console.log("No updates found. Sync complete.");
      return { status: "No updates", checkedAt: jobStartTime.toISOString() };
    }

    // 3. Upsert data to FalkorDB
    const stats = await upsertToFalkorDB(updates);

    // 4. If successful, update the state with the new sync timestamp
    const newState: State = {
      ...previousState,
      lastSyncTimestamp: jobStartTime.toISOString(),
    };
    await wmill.setState(newState);

    console.log("\n--- Sync Successful ---");
    console.log(`Updated state with new timestamp: ${newState.lastSyncTimestamp}`);
    console.log(`Nodes processed: ${stats.nodesCreated}`);
    console.log(`Relationships processed: ${stats.relationshipsCreated}`);
    console.log("-----------------------");

    return { status: "Success", ...stats };

  } catch (error: any) {
    console.error("\n--- Sync Failed ---");
    console.error(`Error during sync process: ${error.message}`);
    console.error("State will not be updated, will retry from the same timestamp on next run.");
    console.error("-------------------");

    return { status: "Failed", error: error.message };
  }
}
