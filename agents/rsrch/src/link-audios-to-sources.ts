// Script to link existing audio artifacts to sources in FalkorDB
// Run: node dist/link-audios-to-sources.js

const { getGraphStore } = require('./graph-store');
import logger from './logger';

async function main() {
    const store = getGraphStore();
    await store.connect('localhost', 6379);

    const nbId = '7805f28c-ce4c-4195-b3cc-3fd47f40635b';

    // Get sources
    const sources = await store.graph.query(`
        MATCH (n:Notebook {platformId: "${nbId}"})-[:HAS_SOURCE]->(s:Source) RETURN s.title as title
    `);

    logger.info(`Found ${sources.data?.length || 0} sources`);

    // For each source, try to link audio by matching title
    for (const row of sources.data || []) {
        const sourceTitle = row.title;
        const prefix = sourceTitle.substring(0, 20);

        const result = await store.graph.query(`
            MATCH (n:Notebook {platformId: "${nbId}"})-[:HAS_SOURCE]->(s:Source {title: "${sourceTitle}"})
            MATCH (n)-[:HAS_AUDIO]->(ao:AudioOverview)
            WHERE ao.title CONTAINS "${prefix}"
            MERGE (ao)-[r:GENERATED_FROM]->(s)
            SET r.createdAt = ${Date.now()}
            RETURN ao.title as audio, s.title as source
        `);

        if (result.data && result.data.length > 0) {
            logger.info(`Linked: ${sourceTitle}`);
        }
    }

    // Verify
    const linked = await store.graph.query(`
        MATCH (n:Notebook)-[:HAS_SOURCE]->(s:Source)<-[:GENERATED_FROM]-(ao:AudioOverview)
        WHERE n.platformId = "${nbId}"
        RETURN s.title as source, ao.title as audio
    `);

    logger.info('\nLinked audio-source pairs:');
    for (const row of linked.data || []) {
        logger.info(`  ${row.source} <- ${row.audio?.substring(0, 30)}`);
    }

    await store.disconnect();
}

main().catch(logger.error);
