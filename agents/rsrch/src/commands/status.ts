import { Command } from 'commander';
import { config } from '../config';
import { execSync } from 'child_process';
import * as net from 'net';
import axios from 'axios';

// Helper to check TCP connection
function checkTcp(host: string, port: number, timeout = 2000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
}

// Helper to check HTTP status
async function checkHttp(url: string, timeout = 2000): Promise<boolean> {
    try {
        const res = await axios.get(url, { timeout, validateStatus: () => true });
        return res.status >= 200 && res.status < 400;
    } catch (e) {
        return false;
    }
}

// Helper to execute SSH commands safely
function runRemoteCommand(host: string, cmd: string): string | null {
    try {
        return execSync(`ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no ${host} "${cmd}"`, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch (e) {
        return null;
    }
}

export const statusCommand = new Command('status')
    .description('Check health and status of RSRCH Browser, RSRCH Server, Windmill, and Worker')
    .option('--host <host>', 'Target server host', config.host)
    .action(async (opts) => {
        const targetHost = opts.host;
        console.log(`\n🔍 Checking PWF Services status on \x1b[36m${targetHost}\x1b[0m...`);

        // 1. Probing Ports & Endpoints
        console.log('\n\x1b[1m=== Network Probes ===\x1b[0m');
        
        // RSRCH Server
        const rsrchServerUrl = `http://${targetHost}:${config.port}/health`;
        const rsrchServerOk = await checkHttp(rsrchServerUrl);
        console.log(`- RSRCH API Server (:${config.port}): ${rsrchServerOk ? '🟢 \x1b[32mUP (Healthy)\x1b[0m' : '🔴 \x1b[31mDOWN / UNREACHABLE\x1b[0m'}`);

        // RSRCH Browser VNC & CDP
        const vncOk = await checkTcp(targetHost, config.vncPort);
        const cdpOk = await checkTcp(targetHost, config.chromiumPort);
        console.log(`- Browser VNC (:${config.vncPort}): ${vncOk ? '🟢 \x1b[32mOPEN (Accessible)\x1b[0m' : '🔴 \x1b[31mCLOSED / UNREACHABLE\x1b[0m'}`);
        console.log(`- Browser CDP (:${config.chromiumPort}): ${cdpOk ? '🟢 \x1b[32mOPEN (Accessible)\x1b[0m' : '🔴 \x1b[31mCLOSED / UNREACHABLE\x1b[0m'}`);

        // Windmill Server
        const windmillUrl = config.windmill?.apiUrl || `http://${targetHost}:8000/`;
        const windmillOk = await checkHttp(windmillUrl);
        console.log(`- Windmill Server (${windmillUrl.match(/:(\d+)/)?.[1] || '8000'}): ${windmillOk ? '🟢 \x1b[32mUP (Healthy)\x1b[0m' : '🔴 \x1b[31mDOWN / UNREACHABLE\x1b[0m'}`);

        // FalkorDB Server
        const falkorOk = await checkTcp(targetHost, config.falkor.port);
        console.log(`- FalkorDB Database (:${config.falkor.port}): ${falkorOk ? '🟢 \x1b[32mOPEN (Accessible)\x1b[0m' : '🔴 \x1b[31mCLOSED / UNREACHABLE\x1b[0m'}`);

        // 2. Querying Nomad Job Status via SSH
        console.log('\n\x1b[1m=== Nomad Scheduler (Remote Status) ===\x1b[0m');
        
        const jobs = ['rsrch-browser', 'rsrch', 'windmill', 'falkor'];
        for (const job of jobs) {
            const statusOutput = runRemoteCommand(targetHost, `nomad job status ${job}`);
            if (statusOutput) {
                // Parse Status and Summary
                const statusMatch = statusOutput.match(/Status\s+=\s+(\w+)/);
                const status = statusMatch ? statusMatch[1] : 'Unknown';
                
                // Color status
                let coloredStatus = status;
                if (status === 'running') coloredStatus = `\x1b[32m${status}\x1b[0m`;
                else if (status === 'dead') coloredStatus = `\x1b[31m${status}\x1b[0m`;
                else coloredStatus = `\x1b[33m${status}\x1b[0m`;

                console.log(`\n\x1b[36mJob: ${job}\x1b[0m [Status: ${coloredStatus}]`);
                
                // Extract task group running state if possible
                const runningTasks = statusOutput.split('\n').filter(line => line.includes('running') || line.includes('browser') || line.includes('windmill') || line.includes('server') || line.includes('worker') || line.includes('falkor'));
                if (runningTasks.length > 0) {
                    runningTasks.forEach(taskLine => {
                        if (taskLine.trim() && !taskLine.includes('Job ID') && !taskLine.includes('Submit Date')) {
                            console.log(`  └─ ${taskLine.replace(/\s+/g, ' ').trim()}`);
                        }
                    });
                }
            } else {
                console.log(`\x1b[33m⚠️  Job ${job}: Could not fetch remote status (SSH failed or Nomad command missing)\x1b[0m`);
            }
        }

        // 3. Probing FalkorDB Memory and Graph Metrics
        if (falkorOk) {
            console.log('\n\x1b[1m=== Graph Database (FalkorDB Metrics) ===\x1b[0m');
            const containerName = runRemoteCommand(targetHost, "docker ps --filter name=falkor --format '{{.Names}}' | head -n 1");
            if (containerName) {
                // Memory Metrics
                const memoryInfo = runRemoteCommand(targetHost, `docker exec ${containerName} redis-cli -p ${config.falkor.port} info memory`);
                const usedMemoryHuman = memoryInfo?.match(/used_memory_human:([^\r\n]+)/)?.[1];
                const usedMemoryRssHuman = memoryInfo?.match(/used_memory_rss_human:([^\r\n]+)/)?.[1];
                
                // Graph Node & Relation Counts
                const nodeCountRaw = runRemoteCommand(targetHost, `docker exec ${containerName} redis-cli -p ${config.falkor.port} GRAPH.QUERY rsrch 'MATCH (n) RETURN count(n)'`);
                const nodeCount = nodeCountRaw?.split('\n').map(l => l.trim()).find(l => /^\d+$/.test(l)) || '0';
                
                const edgeCountRaw = runRemoteCommand(targetHost, `docker exec ${containerName} redis-cli -p ${config.falkor.port} GRAPH.QUERY rsrch 'MATCH ()-[r]->() RETURN count(r)'`);
                const edgeCount = edgeCountRaw?.split('\n').map(l => l.trim()).find(l => /^\d+$/.test(l)) || '0';

                console.log(`- Graph Name:     \x1b[36mrsrch\x1b[0m`);
                console.log(`- Nodes (Count):  \x1b[32m${nodeCount}\x1b[0m`);
                console.log(`- Edges (Count):  \x1b[32m${edgeCount}\x1b[0m`);
                if (usedMemoryHuman) {
                    console.log(`- Memory Usage:   \x1b[35m${usedMemoryHuman}\x1b[0m (RSS: ${usedMemoryRssHuman || 'N/A'})`);
                }

                // Recent Synced Problems from Knowledge Graph
                const recentProblemsRaw = runRemoteCommand(targetHost, `docker exec ${containerName} redis-cli GRAPH.QUERY rsrch 'MATCH (p:Problem) RETURN p.name LIMIT 3'`);
                const recentProblems = recentProblemsRaw?.split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.includes('p.name') && !l.includes('Cached') && !l.includes('Query internal') && !l.includes('execution'));
                
                if (recentProblems && recentProblems.length > 0) {
                    console.log(`- Sample Problems in Graph:`);
                    recentProblems.forEach(p => {
                        console.log(`  ├─ \x1b[90m${p}\x1b[0m`);
                    });
                }
            } else {
                console.log('⚠️  Could not resolve falkor container name to fetch graph metrics.');
            }
        }

        // 4. Custom Lua Hooks
        if (config.hooks && typeof config.hooks.custom_status === 'function') {
            console.log('\n\x1b[1m=== Custom Metrics (Lua) ===\x1b[0m');
            try {
                const customMetrics = await Promise.resolve(config.hooks.custom_status());
                if (customMetrics) {
                    const parsed: Record<string, any> = {};
                    if (typeof customMetrics === 'function' && Symbol.iterator in customMetrics) {
                        for (const [k, v] of customMetrics) {
                            parsed[k] = v;
                        }
                    } else if (typeof customMetrics === 'object') {
                        for (const [k, v] of Object.entries(customMetrics)) {
                            parsed[k] = v;
                        }
                    } else {
                        parsed.result = String(customMetrics);
                    }
                    for (const [key, value] of Object.entries(parsed)) {
                        console.log(`- ${key}: \x1b[36m${value}\x1b[0m`);
                    }
                }
            } catch (e: any) {
                console.log(`\x1b[31m⚠️ Error executing custom_status Lua hook: ${e.message}\x1b[0m`);
            }
        }

        console.log('');
    });
