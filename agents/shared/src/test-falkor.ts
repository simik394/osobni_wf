/**
 * Test FalkorDB connectivity and basic operations
 */

import { LegacyFalkorClient as FalkorClient } from './falkor-client';

async function main() {
    console.log('🧪 Testing FalkorDB connectivity...\n');

    const client = new FalkorClient('localhost', 6379, 'angrav');

    try {
        // 1. Ensure indexes exist
        console.log('1. Creating indexes...');
        await client.ensureIndexes();

        // 2. Create a test session
        console.log('\n2. Creating test session...');
        const sessionId = await client.createSession('Test Session from Shared Lib', 'workspace');
        console.log(`   Session ID: ${sessionId}`);

        // 3. Verify session retrieval
        console.log('\n3. Retrieving session...');
        const session = await client.getSession(sessionId);
        console.log('   Session:', session);

        // 4. Log an interaction
        console.log('\n4. Logging interaction...');
        const interactionId = await client.logInteraction(
            sessionId,
            'test-script',
            'action',
            'Testing FalkorDB integration'
        );
        console.log(`   Interaction ID: ${interactionId}`);

        // 5. List all sessions
        console.log('\n5. Listing all sessions...');
        const sessions = await client.listSessions('workspace');
        console.log(`   Found ${sessions.length} sessions:`);
        sessions.forEach(s => console.log(`   - ${s.name} (${s.id})`));

        // 6. Get interactions
        console.log('\n6. Getting interactions...');
        const interactions = await client.getInteractions(sessionId);
        console.log(`   Found ${interactions.length} interactions`);

        console.log('\n✅ All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
    }
}

main();
