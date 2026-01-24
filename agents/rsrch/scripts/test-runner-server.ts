/**
 * Simple test runner server for the interactive test report.
 * 
 * Provides an HTTP endpoint that runs vitest and returns JSON results.
 * The Quarto report fetches from this server to get live test results.
 * 
 * Usage: npx ts-node scripts/test-runner-server.ts
 * Then open TEST_REPORT.html and click "Run Tests"
 */

/// <reference types="node" />

import { spawn, ChildProcess } from 'child_process';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';

const PORT = 3099;
const PROJECT_DIR = path.join(__dirname, '..');
const RESULTS_FILE = path.join(PROJECT_DIR, 'test-results.json');


interface TestResult {
    status: 'running' | 'completed' | 'error';
    timestamp: string;
    duration?: number;
    results?: any;
    error?: string;
}

let currentRun: TestResult | null = null;

function runTests(): Promise<any> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        currentRun = {
            status: 'running',
            timestamp: new Date().toISOString()
        };

        // Run vitest with JSON reporter
        const vitest = spawn('npx', [
            'vitest', 'run',
            '--reporter=json',
            '--outputFile=test-results.json'
        ], {
            cwd: PROJECT_DIR,
            shell: true
        });

        let stdout = '';
        let stderr = '';

        vitest.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
            console.log(data.toString());
        });

        vitest.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
            console.error(data.toString());
        });

        vitest.on('close', (code: number | null) => {
            const duration = Date.now() - startTime;

            try {
                // Read the JSON results file that vitest created
                const resultsJson = readFileSync(RESULTS_FILE, 'utf-8');
                const results = JSON.parse(resultsJson);
                currentRun = {
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                    duration,
                    results
                };
                resolve(currentRun);
            } catch (e) {
                currentRun = {
                    status: 'error',
                    timestamp: new Date().toISOString(),
                    duration,
                    error: `Failed to parse results: ${e}`
                };
                reject(currentRun);
            }
        });

        vitest.on('error', (err: Error) => {
            currentRun = {
                status: 'error',
                timestamp: new Date().toISOString(),
                error: err.message
            };
            reject(currentRun);
        });
    });
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (url.pathname === '/run-tests' && req.method === 'POST') {
        // Trigger test run
        console.log('🧪 Starting test run...');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', message: 'Tests are running...' }));

        runTests()
            .then(() => console.log('✅ Tests completed'))
            .catch((err) => console.error('❌ Tests failed:', err));

    } else if (url.pathname === '/run-tests-sync' && req.method === 'POST') {
        // Synchronous test run - wait for completion
        console.log('🧪 Starting synchronous test run...');

        runTests()
            .then((result) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            })
            .catch((err) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(err));
            });

    } else if (url.pathname === '/status' && req.method === 'GET') {
        // Get current status
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentRun || { status: 'idle' }));

    } else if (url.pathname === '/results' && req.method === 'GET') {
        // Get latest results from file
        try {
            if (!existsSync(RESULTS_FILE)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No results file found. Run tests first.' }));
                return;
            }
            const resultsJson = readFileSync(RESULTS_FILE, 'utf-8');
            const results = JSON.parse(resultsJson);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No results file found. Run tests first.' }));
        }

    } else if (url.pathname === '/run-single' && req.method === 'POST') {
        // Run a single test by name
        let body = '';
        req.on('data', (chunk: Buffer) => body += chunk);
        req.on('end', () => {
            try {
                const { testFile, testName } = JSON.parse(body);
                console.log(`🧪 Running single test: ${testFile} - "${testName}"`);

                const vitest = spawn('npx', [
                    'vitest', 'run',
                    `tests/${testFile}`,
                    '-t', testName,
                    '--reporter=json'
                ], {
                    cwd: PROJECT_DIR,
                    shell: true
                });

                let output = '';
                vitest.stdout?.on('data', (data: Buffer) => output += data);
                vitest.stderr?.on('data', (data: Buffer) => output += data);

                vitest.on('close', (code: number | null) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: code === 0,
                        output,
                        testFile,
                        testName
                    }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request body' }));
            }
        });

    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
}

const server = createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`
🧪 Test Runner Server
━━━━━━━━━━━━━━━━━━━━━
Listening on: http://localhost:${PORT}

Endpoints:
  POST /run-tests      - Start test run (async)
  POST /run-tests-sync - Run tests and wait for results
  GET  /status         - Get current run status
  GET  /results        - Get latest test results
  POST /run-single     - Run a single test

Open TEST_REPORT.html and click "Run Tests" to use.
Press Ctrl+C to stop.
`);
});
