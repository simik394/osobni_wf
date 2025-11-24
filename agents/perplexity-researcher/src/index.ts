import { login } from './auth';
import { runQuery } from './query';
import * as fs from 'fs';
import { config } from './config';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    if (command === 'auth') {
        await login();
    } else if (command === 'query') {
        const query = args[1];
        if (query) {
            await runQuery(query);
        } else {
            // Check if queries.json exists and run batch
            if (fs.existsSync(config.paths.queriesFile)) {
                console.log('No query argument provided. Reading from queries.json...');
                const queries = JSON.parse(fs.readFileSync(config.paths.queriesFile, 'utf-8'));
                if (Array.isArray(queries)) {
                    for (const q of queries) {
                        await runQuery(q);
                    }
                } else {
                    console.error('queries.json should be an array of strings.');
                }
            } else {
                console.error('Please provide a query: npm run query "Your question"');
            }
        }
    } else {
        console.log('Usage:');
        console.log('  npm run auth            - Login to Perplexity');
        console.log('  npm run query "Question" - Run a single query');
        console.log('  npm run query           - Run queries from data/queries.json');
    }
}

main().catch(console.error);
