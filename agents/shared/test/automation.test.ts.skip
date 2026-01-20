
import { FalkorClient, getFalkorClient } from '../src/falkor-client';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies if needed, or use integration tests if DB is available.
// For TDD, we currently expect "Method not implemented".

describe('FalkorDB Phase 5 Automation Features', () => {
    let client: FalkorClient;

    beforeAll(async () => {
        client = getFalkorClient();
        // Ensure connection (might fail if no Redis, but stubs throw error anyway)
        // await client... 
    });

    afterAll(async () => {
        await client.close();
    });

    describe('1. Infrastructure State (Consul Sync)', () => {
        test('syncServicesFromConsul should sync services from Consul', async () => {
            // Mock axios (simple monkey-patch for this test)
            const axios = require('axios');
            const originalGet = axios.get;
            axios.get = jest.fn().mockResolvedValue({
                data: {
                    'obsidian-sync': ['s1'],
                    'vectordb': ['s2']
                }
            });

            try {
                await client.syncServicesFromConsul();

                // Verify Graph
                const result = await client.query(`MATCH (s:Service) RETURN s.name ORDER BY s.name`);
                // Result includes 'obsidian-sync', 'vectordb' (and potentially others from previous tests)
                const names = result.map(r => Array.isArray(r['s.name']) ? r['s.name'][0] : r['s.name']);
                expect(names).toContain('obsidian-sync');
                expect(names).toContain('vectordb');
            } finally {
                axios.get = originalGet;
            }
        });

        test('resolveService should return endpoint', async () => {
            // Mocking: We insert a fake service node into DB first to simulate it being found
            const serviceId = 'test-svc-' + uuidv4();
            await client.query(`
                CREATE (:Service {
                    id: $id, 
                    name: 'test-svc', 
                    address: '1.2.3.4', 
                    port: 8080,
                    status: 'online'
                })
            `, { id: serviceId });

            const result = await client.resolveService('test-svc');
            expect(result).not.toBeNull();
            expect(result?.address).toBe('1.2.3.4');
            expect(result?.port).toBe(8080);
        });
    });

    describe('2. Resource Allocation (Locking)', () => {
        const resource = '/tmp/profile-test-' + uuidv4();
        let sessionId: string;
        let otherSession: string;

        // Create sessions
        beforeAll(async () => {
            sessionId = await client.createSession('Test Session', 'test-ws');
            otherSession = await client.createSession('Other Session', 'test-ws');
        });

        test('acquireLock should lock a free resource', async () => {
            const success = await client.acquireLock(resource, sessionId, 30);
            expect(success).toBe(true);

            // Verify Graph Node
            const result = await client.query(`
                MATCH (r:Resource {path: $path, in_use: true, locked_by: $sid})
                RETURN r
            `, { path: resource, sid: sessionId });
            expect(result.length).toBe(1);
        });

        test('acquireLock should fail on contested resource', async () => {
            const success = await client.acquireLock(resource, otherSession, 30);
            expect(success).toBe(false);
        });

        test('releaseLock should release the lock', async () => {
            await client.releaseLock(resource, sessionId);

            // Verify lock released
            const success = await client.acquireLock(resource, otherSession, 30);
            expect(success).toBe(true);

            // Clean up
            await client.releaseLock(resource, otherSession);
        });
    });

    describe('4. Cost Tracking', () => {
        const sessionId = 'test-session-cost-' + uuidv4();

        beforeAll(async () => {
            await client.createSession(sessionId, 'locked_workspace');
        });

        test.skip('trackCost should log token usage', async () => {
            await client.trackCost(sessionId, 'gpt-4', 100, 200);

            // Verify Cost Node
            const result = await client.query(`
                MATCH (s:Session {id: $sid})-[:INCURRED]->(c:Cost)
                RETURN c
            `, { sid: sessionId });

            expect(result.length).toBeGreaterThan(0);
            const costNode = result[0]['c'];
            expect(costNode.model).toBe('gpt-4');
            const tokens = typeof costNode.tokens === 'string' ? parseInt(costNode.tokens) : costNode.tokens;
            expect(tokens).toBe(300);
        });
    });

    describe('5. Work Hierarchy', () => {
        const goalId = uuidv4();

        beforeAll(async () => {
            // Create goal node manually for test context
            await client.query(`CREATE (:Goal {id: $id, title: 'Test Goal'})`, { id: goalId });
        });

        test('createTask should create Task and link to Goal', async () => {
            const taskId = await client.createTask(goalId, 'Test Task', 'Task Description');
            expect(taskId).toBeDefined();

            // Verify Graph Link
            const result = await client.query(`
                MATCH (g:Goal {id: $gid})-[:HAS_SUBTASK]->(t:Task {id: $tid})
                RETURN t
            `, { gid: goalId, tid: taskId });

            expect(result.length).toBe(1);
            const task = result[0]['t'];
            expect(task.title).toBe('Test Task');
            expect(task.status).toBe('pending');
        });
    });
});
