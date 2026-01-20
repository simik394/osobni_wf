import { FalkorClient } from '../src/db/falkor';
import { FalkorDB } from 'falkordb';

// Mock FalkorDB
jest.mock('falkordb', () => {
    const mockGraph = {
        query: jest.fn().mockResolvedValue({ data: [] })
    };
    const mockClient = {
        selectGraph: jest.fn().mockReturnValue(mockGraph),
        close: jest.fn().mockResolvedValue(undefined)
    };
    return {
        FalkorDB: {
            connect: jest.fn().mockResolvedValue(mockClient)
        }
    };
});

describe('FalkorClient', () => {
    let client: FalkorClient;

    beforeEach(() => {
        client = new FalkorClient({
            host: 'localhost',
            port: 6379,
            graphName: 'test-graph',
            maxRetries: 1,
            retryDelay: 0
        });
        jest.clearAllMocks();
    });

    it('should connect successfully', async () => {
        await client.connect();
        expect(FalkorDB.connect).toHaveBeenCalledWith({
            socket: { host: 'localhost', port: 6379 }
        });
        expect(client.getIsConnected()).toBe(true);
    });

    it('should execute query', async () => {
        await client.connect();
        await client.executeQuery('MATCH (n) RETURN n');

        // Access the mocked client and graph to verify calls
        const mockClient = await (FalkorDB.connect as jest.Mock).mock.results[0].value;
        const mockGraph = mockClient.selectGraph();
        expect(mockGraph.query).toHaveBeenCalledWith('MATCH (n) RETURN n', undefined);
    });

    it('should disconnect', async () => {
        await client.connect();
        await client.disconnect();
        expect(client.getIsConnected()).toBe(false);
    });
});
