/**
 * Human Lock - Anti-Detection Mutex
 * 
 * Ensures only ONE input action (click/type) happens at a time across ALL agents.
 * This makes interactions look human (one pair of hands, one cursor).
 * 
 * Uses Redis (FalkorDB exposes Redis protocol on port 6379).
 */

const LOCK_KEY = 'windmill:human_input_lock';
const DEFAULT_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 100;

// Redis client - will be initialized on first use
let redisClient: any = null;

async function getRedisClient() {
    if (redisClient) return redisClient;

    // Dynamic import for Windmill environment
    const { createClient } = await import('redis');

    // Connect to FalkorDB (Redis-compatible) or standalone Redis
    const redisUrl = process.env.REDIS_URL || 'redis://falkordb:6379';

    redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err: any) => console.error('Redis error:', err));

    await redisClient.connect();
    return redisClient;
}

/**
 * Acquire the global human lock.
 * Blocks until lock is available or timeout is reached.
 */
export async function acquireHumanLock(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<boolean> {
    const client = await getRedisClient();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        // Try to acquire lock with NX (set if not exists) and PX (expiry in ms)
        const acquired = await client.set(LOCK_KEY, 'locked', {
            NX: true,
            PX: timeoutMs
        });

        if (acquired) {
            console.log('🔒 Human lock acquired');
            return true;
        }

        // Lock is held by someone else, wait and retry
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    throw new Error(`Failed to acquire human lock within ${timeoutMs}ms`);
}

/**
 * Release the global human lock.
 */
export async function releaseHumanLock(): Promise<void> {
    const client = await getRedisClient();
    await client.del(LOCK_KEY);
    console.log('🔓 Human lock released');
}

/**
 * Execute an action while holding the human lock.
 * Ensures the lock is released even if the action throws.
 * 
 * Usage:
 * ```typescript
 * await withHumanHands(async () => {
 *   await page.bringToFront();
 *   await page.click('textarea');
 *   await page.keyboard.type(query, { delay: 50 });
 * });
 * ```
 */
export async function withHumanHands<T>(
    action: () => Promise<T>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
    await acquireHumanLock(timeoutMs);

    try {
        return await action();
    } finally {
        await releaseHumanLock();
    }
}

/**
 * Human-like typing with random delays between keystrokes.
 * Use this instead of page.keyboard.type() for more natural behavior.
 */
export async function humanType(
    page: any,
    text: string,
    options: { minDelay?: number; maxDelay?: number } = {}
): Promise<void> {
    const minDelay = options.minDelay ?? 30;
    const maxDelay = options.maxDelay ?? 80;

    for (const char of text) {
        await page.keyboard.type(char);
        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        await new Promise(r => setTimeout(r, delay));
    }
}

/**
 * Cleanup function - call when shutting down
 */
export async function closeLockClient(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
