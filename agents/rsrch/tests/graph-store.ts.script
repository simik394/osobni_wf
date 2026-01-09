/**
 * Graph Store Tests
 * Tests for FalkorDB-based graph store
 */

import { GraphStore } from '../src/graph-store';

async function runTests() {
    console.log('=== Graph Store Tests ===\n');

    const store = new GraphStore('rsrch_test');

    try {
        // Test 1: Connection
        console.log('Test 1: Connection...');
        await store.connect('localhost', 6379);
        console.log('✅ Connected to FalkorDB\n');

        // Test 2: Add Job
        console.log('Test 2: Add Job...');
        const job = await store.addJob('query', 'What is AI?', { deep: true });
        console.assert(job.id.length === 8, 'Job ID should be 8 chars');
        console.assert(job.status === 'queued', 'Job should be queued');
        console.assert(job.type === 'query', 'Job type should be query');
        console.log(`✅ Job created: ${job.id}\n`);

        // Test 3: Get Job
        console.log('Test 3: Get Job...');
        const retrieved = await store.getJob(job.id);
        console.assert(retrieved !== null, 'Job should be found');
        console.assert(retrieved?.id === job.id, 'Job ID should match');
        console.assert(retrieved?.query === 'What is AI?', 'Query should match');
        console.log(`✅ Job retrieved: ${retrieved?.id}\n`);

        // Test 4: List Jobs
        console.log('Test 4: List Jobs...');
        const jobs = await store.listJobs();
        console.assert(jobs.length >= 1, 'Should have at least 1 job');
        console.log(`✅ Listed ${jobs.length} jobs\n`);

        // Test 5: Update Job Status
        console.log('Test 5: Update Job Status...');
        await store.updateJobStatus(job.id, 'running');
        let updated = await store.getJob(job.id);
        console.assert(updated?.status === 'running', 'Status should be running');
        console.assert(updated?.startedAt !== undefined, 'Should have startedAt');
        console.log(`✅ Job status updated to: ${updated?.status}\n`);

        // Test 6: Complete Job
        console.log('Test 6: Complete Job...');
        await store.updateJobStatus(job.id, 'completed', { result: { answer: 'AI is...' } });
        updated = await store.getJob(job.id);
        console.assert(updated?.status === 'completed', 'Status should be completed');
        console.assert(updated?.result?.answer === 'AI is...', 'Result should be stored');
        console.log(`✅ Job completed with result\n`);

        // Test 7: Get Next Queued Job
        console.log('Test 7: Get Next Queued Job...');
        const job2 = await store.addJob('deepResearch', 'Coffee origins');
        const nextJob = await store.getNextQueuedJob();
        console.assert(nextJob !== null, 'Should have a queued job');
        console.assert(nextJob?.id === job2.id, 'Should be the second job');
        console.log(`✅ Next queued job: ${nextJob?.id}\n`);

        // Test 8: Add Entity
        console.log('Test 8: Add Entity...');
        await store.addEntity({
            id: 'topic-1',
            type: 'Topic',
            name: 'Artificial Intelligence',
            properties: { domain: 'technology' }
        });
        console.log('✅ Entity added\n');

        // Test 9: Find Entities
        console.log('Test 9: Find Entities...');
        const entities = await store.findEntities('Topic');
        console.assert(entities.length >= 1, 'Should find entity');
        console.assert(entities[0].name === 'Artificial Intelligence', 'Name should match');
        console.log(`✅ Found ${entities.length} entities\n`);

        // Test 10: Add Relationship
        console.log('Test 10: Add Relationship...');
        await store.addEntity({
            id: 'topic-2',
            type: 'Topic',
            name: 'Machine Learning',
            properties: {}
        });
        await store.addRelationship({
            from: 'topic-1',
            to: 'topic-2',
            type: 'RELATES_TO'
        });
        console.log('✅ Relationship added\n');

        // Test 11: Find Related
        console.log('Test 11: Find Related...');
        const related = await store.findRelated('topic-1', 'RELATES_TO');
        console.assert(related.length >= 1, 'Should find related entity');
        console.assert(related[0].name === 'Machine Learning', 'Should find ML');
        console.log(`✅ Found ${related.length} related entities\n`);

        // Test 12: Agent Memory - Store Fact
        console.log('Test 12: Store Fact...');
        await store.storeFact('agent-1', 'User prefers dark mode', { source: 'settings' });
        console.log('✅ Fact stored\n');

        // Test 13: Agent Memory - Get Facts
        console.log('Test 13: Get Facts...');
        const facts = await store.getFacts('agent-1');
        console.assert(facts.length >= 1, 'Should have at least 1 fact');
        console.assert(facts[0] === 'User prefers dark mode', 'Fact should match');
        console.log(`✅ Retrieved ${facts.length} facts\n`);

        // Test 14: Sync Conversation
        console.log('Test 14: Sync Conversation...');
        const convResult = await store.syncConversation({
            platform: 'gemini',
            platformId: 'test-session-123',
            title: 'Test AI Discussion',
            type: 'regular',
            turns: [
                { role: 'user', content: 'What is machine learning?' },
                { role: 'assistant', content: 'Machine learning is a subset of AI...' },
                { role: 'user', content: 'Can you give an example?' },
                { role: 'assistant', content: 'Sure! Image recognition is an example...' }
            ]
        });
        console.assert(convResult.id.startsWith('conv_gemini_'), 'Conv ID should have platform prefix');
        console.assert(convResult.isNew === true, 'Should be new conversation');
        console.log(`✅ Conversation synced: ${convResult.id}\n`);

        // Test 15: Sync Deep Research Conversation
        console.log('Test 15: Sync Deep Research Conversation...');
        const drResult = await store.syncConversation({
            platform: 'gemini',
            platformId: 'dr-session-456',
            title: 'Deep Research on Climate',
            type: 'deep-research',
            turns: [
                { role: 'user', content: 'Research climate change impacts' },
                { role: 'assistant', content: 'Starting deep research...' }
            ],
            researchDocs: [{
                title: 'Climate Change Report',
                content: 'The study found significant results[^1] in temperature data.\n\n[^1]: [IPCC Report](https://ipcc.ch) - ipcc.ch',
                sources: [{ id: 1, text: 'IPCC Report', url: 'https://ipcc.ch', domain: 'ipcc.ch' }],
                reasoningSteps: [{ phase: 'research', action: 'Searched academic sources' }]
            }]
        });
        console.assert(drResult.isNew === true, 'Should be new deep research');
        console.log(`✅ Deep research synced: ${drResult.id}\n`);

        // Test 16: Re-sync (upsert) Conversation
        console.log('Test 16: Re-sync Conversation (upsert)...');
        const resync = await store.syncConversation({
            platform: 'gemini',
            platformId: 'test-session-123',
            title: 'Test AI Discussion',
            type: 'regular',
            turns: []
        });
        console.assert(resync.isNew === false, 'Should not be new on re-sync');
        console.log(`✅ Conversation re-synced (updated only)\n`);

        // Test 17: Get Conversations by Platform
        console.log('Test 17: Get Conversations by Platform...');
        const convs = await store.getConversationsByPlatform('gemini', 10);
        console.assert(convs.length >= 2, 'Should have at least 2 conversations');
        console.assert(convs[0].platformId !== undefined || convs[0].id.includes('gemini'), 'Should be gemini convs');
        console.log(`✅ Found ${convs.length} gemini conversations\n`);

        // Test 18: Get Conversation with Filters (all)
        console.log('Test 18: Get Conversation with Filters (all)...');
        const fullConv = await store.getConversationWithFilters(convResult.id, {});
        console.assert(fullConv.conversation !== null, 'Should find conversation');
        console.assert(fullConv.turns.length === 4, 'Should have 4 turns');
        console.log(`✅ Full conversation: ${fullConv.turns.length} turns\n`);

        // Test 19: Get Conversation with Filter (questions only)
        console.log('Test 19: Get Conversation (questions only)...');
        const questionsOnly = await store.getConversationWithFilters(convResult.id, { questionsOnly: true });
        console.assert(questionsOnly.turns.length === 2, 'Should have 2 user turns');
        console.assert(questionsOnly.turns.every(t => t.role === 'user'), 'All should be user');
        console.log(`✅ Questions only: ${questionsOnly.turns.length} turns\n`);

        // Test 20: Get Conversation with Filter (answers only)
        console.log('Test 20: Get Conversation (answers only)...');
        const answersOnly = await store.getConversationWithFilters(convResult.id, { answersOnly: true });
        console.assert(answersOnly.turns.length === 2, 'Should have 2 assistant turns');
        console.assert(answersOnly.turns.every(t => t.role === 'assistant'), 'All should be assistant');
        console.log(`✅ Answers only: ${answersOnly.turns.length} turns\n`);

        // Test 21: Get Deep Research with ResearchDocs
        console.log('Test 21: Get Deep Research with ResearchDocs...');
        const drConv = await store.getConversationWithFilters(drResult.id, { includeResearchDocs: true });
        console.assert(drConv.conversation?.type === 'deep-research', 'Should be deep-research type');
        console.assert(drConv.researchDocs && drConv.researchDocs.length >= 1, 'Should have research docs');
        console.assert(drConv.researchDocs![0].sources.length >= 1, 'Should have sources');
        console.log(`✅ Deep research: ${drConv.researchDocs?.length} docs, ${drConv.researchDocs?.[0].sources.length} sources\n`);

        console.log('=== All Tests Passed! ===');

    } catch (e: any) {
        console.error('❌ Test failed:', e.message);
        console.error(e.stack);
    } finally {
        await store.disconnect();
    }
}

runTests().catch(console.error);
