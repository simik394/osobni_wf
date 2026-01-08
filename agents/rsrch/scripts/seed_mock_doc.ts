
import { getGraphStore } from '../src/graph-store';
import { config } from '../src/config';

(async () => {
    try {
        const store = getGraphStore();
        await store.connect(process.env.FALKORDB_HOST || 'localhost', parseInt(process.env.FALKORDB_PORT || '6379'));

        console.log('Creating mock ResearchDoc...');
        // Bypass private visibility for seed script
        await (store as any).graph.query(`
            MERGE (d:ResearchDoc {id: 'rd_mock_12345'})
            SET d.title = 'Test Research',
                d.content = 'This is a test document about AI agents and audio generation.',
                d.url = 'http://test.com',
                d.createdAt = ${Date.now()}
            RETURN d
        `);
        console.log('Mock doc created.');
        await store.disconnect();
    } catch (e) {
        console.error(e);
    }
})();
