/**
 * Windmill Flow Template: Batch Processing
 *
 * This template demonstrates a robust pattern for processing a large dataset in batches.
 * It's designed to be adaptable for various data sources like APIs, databases, or file systems.
 *
 * How to use this template:
 * 1. Customize the `fetchDataInBatch` function to retrieve data from your specific source.
 *    - Implement pagination logic using cursors, page numbers, or offsets.
 * 2. Implement your data processing logic within the `processBatch` function.
 *    - This could involve transforming data, calling other services, or storing results.
 * 3. Adjust the `main` function's parameters and initial state as needed.
 * 4. Configure retry logic and error handling in the `main` loop for resilience.
 */

import * as wmill from "windmill-client";

// Define the structure of an item to be processed
type Item = {
  id: string;
  [key: string]: any;
};

// Define the response structure for a batch fetch operation
type BatchResponse = {
  items: Item[];
  nextCursor?: string; // Or use page number, offset, etc.
};

/**
 * Fetches a batch of data from the source.
 *
 * @param cursor - The pagination cursor (or page number/offset).
 * @param batchSize - The number of items to fetch in each batch.
 * @returns A promise that resolves to a BatchResponse.
 */
async function fetchDataInBatch(cursor?: string, batchSize: number = 100): Promise<BatchResponse> {
  // --- Replace with your data fetching logic ---
  // Example: Fetching from a hypothetical API
  const apiUrl = `https://api.example.com/items?limit=${batchSize}${cursor ? `&cursor=${cursor}` : ''}`;
  console.log(`Fetching data from: ${apiUrl}`);

  // const response = await fetch(apiUrl);
  // if (!response.ok) {
  //   throw new Error(`API request failed: ${response.statusText}`);
  // }
  // const data = await response.json();
  // return {
  //   items: data.items,
  //   nextCursor: data.nextCursor,
  // };
  // --- End of replacement section ---

  // Mock data for demonstration purposes
  const mockItems = Array.from({ length: batchSize }, (_, i) => ({
    id: `item-${Date.now()}-${i}`,
    data: `value-${i}`,
  }));
  const mockNextCursor = Math.random() > 0.2 ? `cursor-${Date.now()}` : undefined;

  return Promise.resolve({
    items: mockItems,
    nextCursor: mockNextCursor,
  });
}

/**
 * Processes a single batch of items.
 *
 * @param batch - An array of items to process.
 * @returns A promise that resolves when the batch is processed.
 */
async function processBatch(batch: Item[]): Promise<{ processed: number; failed: number }> {
  console.log(`Processing batch of ${batch.length} items...`);
  let processed = 0;
  let failed = 0;

  for (const item of batch) {
    try {
      // --- Replace with your item processing logic ---
      // Example: Simulate processing time and potential errors
      await new Promise(resolve => setTimeout(resolve, 50));
      if (Math.random() < 0.05) {
        throw new Error(`Failed to process item ${item.id}`);
      }
      // console.log(`Processed item: ${item.id}`);
      // --- End of replacement section ---
      processed++;
    } catch (error: any) {
      console.error(`Error processing item ${item.id}: ${error.message}`);
      failed++;
    }
  }

  return { processed, failed };
}

export async function main(
  initialCursor?: string,
  batchSize: number = 100,
  maxIterations: number = 100 // Safety break to prevent infinite loops
) {
  let cursor = initialCursor;
  let hasMore = true;
  let iteration = 0;

  const summary = {
    totalProcessed: 0,
    totalFailed: 0,
    batchesProcessed: 0,
  };

  while (hasMore && iteration < maxIterations) {
    iteration++;
    console.log(`\n--- Iteration ${iteration}, Cursor: ${cursor || 'start'} ---`);

    try {
      const { items, nextCursor } = await fetchDataInBatch(cursor, batchSize);

      if (items.length > 0) {
        const { processed, failed } = await processBatch(items);
        summary.totalProcessed += processed;
        summary.totalFailed += failed;
        summary.batchesProcessed++;
      }

      cursor = nextCursor;
      hasMore = !!nextCursor && items.length > 0;

      if (!hasMore) {
        console.log("No more items to fetch. Concluding process.");
      }

    } catch (error: any) {
      console.error(`Failed to fetch or process batch: ${error.message}`);
      // Implement retry logic here if needed
      // For example, break the loop after several consecutive failures
      break;
    }
  }

  if (iteration >= maxIterations) {
    console.warn("Reached maximum iterations. Exiting to prevent infinite loop.");
  }

  console.log("\n--- Batch Processing Summary ---");
  console.log(`Total items processed: ${summary.totalProcessed}`);
  console.log(`Total items failed: ${summary.totalFailed}`);
  console.log(`Batches processed: ${summary.batchesProcessed}`);
  console.log("---------------------------------");

  return summary;
}
