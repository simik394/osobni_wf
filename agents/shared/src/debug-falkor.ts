/**
 * Debug script for understanding FalkorDB raw response format
 */

import Redis from 'ioredis';

async function main() {
    const redis = new Redis({ host: 'localhost', port: 6379 });

    try {
        const result = await redis.call('GRAPH.QUERY', 'angrav', 'MATCH (s:Session) RETURN s LIMIT 1');

        console.log('Raw result:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await redis.quit();
    }
}

main();
