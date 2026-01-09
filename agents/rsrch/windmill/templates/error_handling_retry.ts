/**
 * Windmill Flow Template: Error Handling and Retry Logic
 *
 * This template provides a robust pattern for tasks that may fail intermittently,
 * such as network requests or interactions with external services. It implements
 * an exponential backoff with jitter strategy to handle retries gracefully.
 *
 * How to use this template:
 * 1. Place your fallible logic inside the `flakyTask` function.
 * 2. Configure the `retryOptions` in the `main` function to suit your needs.
 * 3. The `withRetries` function can be reused for any async task.
 */

/**
 * A wrapper function that adds retry logic to an async task.
 *
 * @param fn - The async function to execute.
 * @param options - Configuration for retry behavior.
 * @returns The result of the wrapped function if successful.
 * @throws The error from the last attempt if all retries fail.
 */
async function withRetries<T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    initialDelay: number; // in milliseconds
    maxDelay?: number; // in milliseconds
    shouldRetry?: (error: any) => boolean; // Optional function to decide if an error is retry-able
  }
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < options.attempts; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.log(`Attempt ${i + 1} failed: ${error.message}`);

      if (options.shouldRetry && !options.shouldRetry(error)) {
        console.log("Error is not retry-able. Aborting.");
        throw lastError;
      }

      if (i < options.attempts - 1) {
        // Calculate delay with exponential backoff and jitter
        let delay = options.initialDelay * Math.pow(2, i);
        if (options.maxDelay) {
          delay = Math.min(delay, options.maxDelay);
        }
        const jitter = delay * 0.2 * Math.random(); // Add up to 20% jitter
        const waitTime = Math.round(delay + jitter);

        console.log(`Waiting for ${waitTime}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error("All retry attempts failed.");
  throw lastError;
}

/**
 * A sample task that might fail.
 *
 * --- Replace this with your actual logic ---
 */
async function flakyTask(successRate: number): Promise<{ success: true; data: string }> {
  console.log("Attempting the flaky task...");

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < successRate) {
        resolve({ success: true, data: "Task completed successfully!" });
      } else {
        // Simulate different types of errors
        const errorType = Math.random();
        if (errorType < 0.5) {
          reject(new Error("TransientError: Network connection timed out."));
        } else if (errorType < 0.8) {
          reject(new Error("ApiError: Rate limit exceeded."));
        } else {
          reject(new Error("ValidationError: Invalid input provided."));
        }
      }
    }, 500);
  });
}

/**
 * Custom logic to determine if an error should be retried.
 * For example, we should not retry on validation errors.
 */
function isRetryable(error: any): boolean {
    const nonRetryableErrors = ["ValidationError"];
    return !nonRetryableErrors.some(err => error.message.includes(err));
}


export async function main(
  attempts: number = 5,
  initialDelay: number = 1000, // 1 second
  maxDelay: number = 30000, // 30 seconds
  taskSuccessRate: number = 0.3 // Simulate a 30% success rate
) {

  const retryOptions = {
    attempts,
    initialDelay,
    maxDelay,
    shouldRetry: isRetryable
  };

  try {
    // The task to be executed with retry logic
    const taskToRun = () => flakyTask(taskSuccessRate);

    const result = await withRetries(taskToRun, retryOptions);

    console.log("\n--- Task Result ---");
    console.log(result);
    console.log("-------------------");

    return { status: "Succeeded", result };
  } catch (error: any) {
    console.error("\n--- Task Final Status ---");
    console.error(`Task failed after all retries: ${error.message}`);
    console.error("-----------------------");

    return { status: "Failed", error: error.message };
  }
}
