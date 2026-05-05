import { GraphConnection } from './connection';
import { Citation } from '../types/graph-store';
import { escapeString } from './utils';
import logger from '../../services/logger';

export class CitationManager {
    constructor(private connection: GraphConnection) {}

    private async query<T = any>(cypher: string, params?: Record<string, any>) {
        return this.connection.query<T>(cypher, { params });
    }

    /**
     * Merge a Citation node (upsert by URL)
     */
    async mergeCitation(url: string, text: string, domain?: string): Promise<string> {
        const domainValue = domain || (url.includes('://') ? url.split('://')[1].split('/')[0] : 'unknown');
        
        await this.query(`
            MERGE (c:Citation {url: '${escapeString(url)}'})
            ON CREATE SET 
                c.id = 'cit_' + apoc.text.random(8),
                c.text = '${escapeString(text)}',
                c.domain = '${escapeString(domainValue)}',
                c.firstSeenAt = ${Date.now()}
            ON MATCH SET
                c.text = '${escapeString(text)}',
                c.lastSeenAt = ${Date.now()}
        `);

        return url;
    }

    /**
     * Merge multiple citations in a batch
     */
    async mergeCitationsBatch(citations: Array<{ url: string; text?: string; domain?: string }>): Promise<void> {
        const validCitations = citations.filter(c => c.url);
        if (validCitations.length === 0) return;

        const now = Date.now();
        const batch = validCitations.map(c => ({
            url: c.url,
            text: c.text || '',
            domain: c.domain || (c.url.includes('://') ? c.url.split('://')[1].split('/')[0] : 'unknown'),
            now
        }));

        await this.query(`
            UNWIND $batch as row
            MERGE (c:Citation {url: row.url})
            ON CREATE SET 
                c.id = 'cit_' + apoc.text.random(8),
                c.text = row.text,
                c.domain = row.domain,
                c.firstSeenAt = row.now
            ON MATCH SET
                c.text = row.text,
                c.lastSeenAt = row.now
        `, { batch });
    }

    /**
     * Link citations to a turn
     */
    async linkCitationsToTurn(turnId: string, urls: string[]): Promise<void> {
        for (const url of urls) {
            await this.query(`
                MATCH (t:Turn {id: '${escapeString(turnId)}'})
                MATCH (c:Citation {url: '${escapeString(url)}'})
                MERGE (t)-[:MENTIONS]->(c)
            `);
        }
    }

    /**
     * Get citations by domain or limit
     */
    async getCitations(options?: { domain?: string; limit?: number }): Promise<Citation[]> {
        let query = 'MATCH (c:Citation)';
        if (options?.domain) {
            query += ` WHERE c.domain = '${escapeString(options.domain)}'`;
        }
        query += ` RETURN c ORDER BY c.firstSeenAt DESC LIMIT ${options?.limit || 100}`;

        const result = await this.query<any[]>(query);
        return (result.data || []).map((row: any) => {
            const props = row.c?.properties || row.c || row[0];
            return {
                id: props.id,
                url: props.url,
                domain: props.domain,
                text: props.text,
                firstSeenAt: props.firstSeenAt
            };
        });
    }

    /**
     * Get usage of a citation
     */
    async getCitationUsage(url: string): Promise<Array<{ type: 'ResearchDoc' | 'Turn'; id: string; title?: string }>> {
        const result = await this.query<any[]>(`
            MATCH (c:Citation { url: '${escapeString(url)}' })
            OPTIONAL MATCH (d:ResearchDoc)-[:CITES]->(c)
            OPTIONAL MATCH (t:Turn)-[:MENTIONS]->(c)
            RETURN d, t
        `);

        const usage: any[] = [];
        (result.data || []).forEach((row: any) => {
            if (row.d) usage.push({ type: 'ResearchDoc', id: row.d.properties.id, title: row.d.properties.title });
            if (row.t) usage.push({ type: 'Turn', id: row.t.properties.id });
        });
        return usage;
    }

    async migrateCitations(): Promise<{ processed: number, citations: number }> {
        return { processed: 0, citations: 0 };
    }
}
