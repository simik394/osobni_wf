
import * as fs from 'fs';
import { FalkorClient } from '@agents/shared/dist/falkor-client'; // Assuming shared is built/linked

export class KnowledgeBase {
    private client: FalkorClient;

    constructor(client: FalkorClient) {
        this.client = client;
    }

    async syncFromMarkdown(filePath: string): Promise<void> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const topics = content.split(/^## Topic: /gm).slice(1); // Skip preamble

        for (const block of topics) {
            const lines = block.split('\n');
            const topicName = lines[0].trim();

            // Simple parsing assuming "- **Key**: Value" format
            let problem = '';
            let solution = '';

            for (const line of lines) {
                if (line.includes('**Problem**:')) {
                    problem = line.split('**Problem**:')[1].trim();
                } else if (line.includes('**Solution**:')) {
                    solution = line.split('**Solution**:')[1].trim();
                }
            }

            if (topicName && problem && solution) {
                await this.client.query(`
                    MERGE (t:Topic {name: $topic})
                    MERGE (p:Problem {description: $problem})
                    MERGE (s:Solution {description: $solution})
                    MERGE (p)-[:RELATED_TO]->(t)
                    MERGE (p)-[:SOLVED_BY]->(s)
                `, { topic: topicName, problem, solution });
            }
        }
    }
}
