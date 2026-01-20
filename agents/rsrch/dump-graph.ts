import { getGraphStore } from './src/graph-store';
import { config } from './src/config';

async function main() {
    const store = getGraphStore();
    try {
        console.log('[Dump] Connecting to FalkorDB...');
        await store.connect(config.falkor.host, config.falkor.port);
        console.log('[Dump] Connected.');

        console.log('\n--- GRAPH NODES ---');
        const query = 'MATCH (n) RETURN n, labels(n) as labels LIMIT 100';
        const result = await store.executeQuery(query);

        if (result.data && result.data.length > 0) {
            console.log(`Found ${result.data.length} nodes:`);
            console.log(JSON.stringify(result.data, null, 2));
        } else {
            console.log('No nodes found in graph.');
        }

        console.log('\n--- GRAPH RELATIONSHIPS ---');
        const relQuery = 'MATCH ()-[r]->() RETURN r, type(r) as type LIMIT 100';
        const relResult = await store.executeQuery(relQuery);

        if (relResult.data && relResult.data.length > 0) {
            console.log(`Found ${relResult.data.length} relationships:`);
            console.log(JSON.stringify(relResult.data, null, 2));
        } else {
            console.log('No relationships found in graph.');
        }

    } catch (e: any) {
        console.error('[Dump] Error:', e.message);
    } finally {
        await store.disconnect();
    }
}

main();
