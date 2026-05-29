import { Command } from 'commander';
import { config } from '../config';
import { execSync } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Helper to check TCP connection
function checkTcp(host: string, port: number, timeout = 2000): Promise<{ ok: boolean; latency: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.once('connect', () => {
            socket.destroy();
            resolve({ ok: true, latency: Date.now() - start });
        });
        socket.once('error', () => {
            socket.destroy();
            resolve({ ok: false, latency: -1 });
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve({ ok: false, latency: -1 });
        });
        socket.connect(port, host);
    });
}

// Helper to check HTTP status
async function checkHttp(url: string, timeout = 2000): Promise<{ ok: boolean; latency: number; status: number }> {
    const start = Date.now();
    try {
        const res = await axios.get(url, { timeout, validateStatus: () => true });
        return {
            ok: res.status >= 200 && res.status < 400,
            latency: Date.now() - start,
            status: res.status
        };
    } catch (e) {
        return { ok: false, latency: -1, status: 500 };
    }
}

// Helper to execute SSH commands safely
function runRemoteCommand(host: string, cmd: string): { ok: boolean; output: string } {
    try {
        const output = execSync(`ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no ${host} "${cmd}"`, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        return { ok: true, output };
    } catch (e: any) {
        return { ok: false, output: e.message || 'SSH connection failed' };
    }
}

export const verifyCommand = new Command('verify')
    .description('Programmatically verify system feature integrity and generate FEATURE_CATALOG.md')
    .option('--host <host>', 'Target server host', config.host)
    .option('--output <path>', 'Path to write markdown catalog', path.join(process.cwd(), 'FEATURE_CATALOG.md'))
    .action(async (opts) => {
        const targetHost = opts.host;
        const outputPath = opts.output;
        console.log(`\n🩺 \x1b[1mRSRCH Integration Verification & Catalog Generator\x1b[0m`);
        console.log(`Target Host: \x1b[36m${targetHost}\x1b[0m`);
        console.log(`Generating: \x1b[32m${outputPath}\x1b[0m\n`);

        const features: Array<{
            name: string;
            status: '🟢 OK' | '🔴 FAILED' | '⚠️ WARNING';
            checkedAt: string;
            proof: string;
            details?: string;
        }> = [];

        // ----------------------------------------------------
        // 1. Lua Configuration Engine Check
        // ----------------------------------------------------
        console.log('Testing Lua Configuration Engine...');
        const globalLuaPath = path.join(process.env.HOME || '', '.config', 'rsrch', 'status_layout.lua');
        const localLuaPath = path.join(process.cwd(), 'status_layout.lua');
        const luaExists = fs.existsSync(localLuaPath) || fs.existsSync(globalLuaPath);
        
        let luaProof = '';
        let luaStatus: '🟢 OK' | '🔴 FAILED' | '⚠️ WARNING' = '🟢 OK';
        
        if (luaExists) {
            const activePath = fs.existsSync(localLuaPath) ? localLuaPath : globalLuaPath;
            luaProof = `Lua config detected at: ${activePath}. Active Port: ${config.port}. Headless state: ${config.headless}.`;
            // Check override proof
            if (config.port === 9999) {
                luaProof += ` [PROOF: Lua overrode port successfully to 9999]`;
            } else {
                luaProof += ` [NOTICE: No port override active]`;
            }
        } else {
            luaStatus = '⚠️ WARNING';
            luaProof = 'No status_layout.lua found. Defaulting to standard config.json lifecycle.';
        }
        features.push({
            name: 'Lua Configuration Lifecycle',
            status: luaStatus,
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: luaProof
        });

        // ----------------------------------------------------
        // 2. Lua Hooks (custom_status) Check
        // ----------------------------------------------------
        console.log('Testing Lua Custom Hooks...');
        let hookProof = '';
        let hookStatus: '🟢 OK' | '🔴 FAILED' | '⚠️ WARNING' = '🟢 OK';
        
        if (config.hooks && typeof config.hooks.custom_status === 'function') {
            const startHook = Date.now();
            try {
                const hookResult = await Promise.resolve(config.hooks.custom_status());
                const latency = Date.now() - startHook;
                
                // Since fengari-interop converts table to JS object proxy, we must safely extract/serialize it
                let serialized = '{}';
                if (hookResult) {
                    try {
                        const tempObj: Record<string, any> = {};
                        if (typeof hookResult === 'function' && Symbol.iterator in hookResult) {
                            for (const [k, v] of hookResult) {
                                tempObj[k] = v;
                            }
                        } else if (typeof hookResult === 'object') {
                            for (const key of Object.keys(hookResult)) {
                                tempObj[key] = hookResult[key];
                            }
                        } else {
                            tempObj.result = String(hookResult);
                        }
                        serialized = JSON.stringify(tempObj);
                    } catch {
                        // Fallback in case of raw proxy
                        serialized = String(hookResult);
                    }
                }
                hookProof = `Hook 'custom_status' executed successfully in ${latency}ms. Returned: ${serialized}`;
            } catch (e: any) {
                hookStatus = '🔴 FAILED';
                hookProof = `Failed to run custom_status hook: ${e.message}`;
            }
        } else {
            hookStatus = '⚠️ WARNING';
            hookProof = `No 'RSRCH.hooks.custom_status' function defined in config.lua.`;
        }
        features.push({
            name: 'Lua Hooks (custom_status)',
            status: hookStatus,
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: hookProof
        });

        // ----------------------------------------------------
        // 3. Network Ports Handshake Check
        // ----------------------------------------------------
        console.log('Checking network connectivity...');
        
        // VNC
        const vncCheck = await checkTcp(targetHost, config.vncPort);
        features.push({
            name: 'Browser VNC Access',
            status: vncCheck.ok ? '🟢 OK' : '🔴 FAILED',
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: vncCheck.ok ? `TCP connection to ${targetHost}:${config.vncPort} established in ${vncCheck.latency}ms` : `TCP connection to ${targetHost}:${config.vncPort} failed (Connection Refused/Timeout)`
        });

        // CDP
        const cdpCheck = await checkTcp(targetHost, config.chromiumPort);
        features.push({
            name: 'Browser CDP Endpoint',
            status: cdpCheck.ok ? '🟢 OK' : '🔴 FAILED',
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: cdpCheck.ok ? `TCP connection to ${targetHost}:${config.chromiumPort} established in ${cdpCheck.latency}ms` : `TCP connection to ${targetHost}:${config.chromiumPort} failed`
        });

        // Windmill
        const windmillUrl = config.windmill?.apiUrl || `http://${targetHost}:8000/`;
        const windmillPort = windmillUrl.match(/:(\d+)/)?.[1] || '8000';
        const wmCheck = await checkHttp(windmillUrl);
        features.push({
            name: 'Windmill API Availability',
            status: wmCheck.ok ? '🟢 OK' : '🔴 FAILED',
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: wmCheck.ok ? `HTTP GET to ${windmillUrl} returned ${wmCheck.status} in ${wmCheck.latency}ms` : `HTTP GET to Windmill failed`
        });

        // ----------------------------------------------------
        // 4. FalkorDB Integration & Persistence Check
        // ----------------------------------------------------
        console.log('Verifying FalkorDB integrity & persistence...');
        const falkorPortCheck = await checkTcp(targetHost, config.falkor.port);
        let falkorStatus: '🟢 OK' | '🔴 FAILED' = '🔴 FAILED';
        let falkorProof = '';

        if (falkorPortCheck.ok) {
            const containerNameRes = runRemoteCommand(targetHost, "docker ps --filter name=falkor --format '{{.Names}}' | head -n 1");
            const containerName = containerNameRes.ok ? containerNameRes.output.trim() : null;

            if (containerName) {
                // Node count check
                const nodeCountRaw = runRemoteCommand(targetHost, `docker exec ${containerName} redis-cli -p ${config.falkor.port} GRAPH.QUERY rsrch 'MATCH (n) RETURN count(n)'`);
                const nodeCount = nodeCountRaw.ok ? (nodeCountRaw.output.split('\n').map(l => l.trim()).find(l => /^\d+$/.test(l)) || '0') : '0';
                
                // Memory check
                const memoryInfo = runRemoteCommand(targetHost, `docker exec ${containerName} redis-cli -p ${config.falkor.port} info memory`);
                const usedMemoryHuman = memoryInfo.ok ? (memoryInfo.output.match(/used_memory_human:([^\r\n]+)/)?.[1] || 'N/A') : 'N/A';

                // Persistence check (Verify dump.rdb size & local path)
                const rdbFileRes = runRemoteCommand(targetHost, `docker exec ${containerName} ls -lh /var/lib/falkordb/data/dump.rdb`);
                let persistenceProof = 'Volume mounted incorrectly';
                if (rdbFileRes.ok && rdbFileRes.output.includes('dump.rdb')) {
                    persistenceProof = `Persistent dump.rdb verified: ${rdbFileRes.output.trim()}`;
                    falkorStatus = '🟢 OK';
                }

                falkorProof = `FalkorDB operational. Active Graph 'rsrch' has ${nodeCount} nodes. RAM: ${usedMemoryHuman}. [PERSISTENCE PROOF: ${persistenceProof}]`;
            } else {
                falkorProof = 'FalkorDB port open, but could not resolve docker container name over remote SSH';
            }
        } else {
            falkorProof = `FalkorDB port ${config.falkor.port} unreachable on ${targetHost}`;
        }

        features.push({
            name: 'FalkorDB Graph & Persistence',
            status: falkorStatus,
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: falkorProof
        });

        // ----------------------------------------------------
        // 5. Nomad Remote Infrastructure Scheduler Check
        // ----------------------------------------------------
        console.log('Validating Nomad Job scheduling...');
        const nomadJobs = ['rsrch-browser', 'rsrch', 'windmill', 'falkor'];
        let nomadStatus: '🟢 OK' | '🔴 FAILED' | '⚠️ WARNING' = '🟢 OK';
        const nomadProofs: string[] = [];

        for (const job of nomadJobs) {
            const statusOutputRes = runRemoteCommand(targetHost, `nomad job status ${job}`);
            if (statusOutputRes.ok) {
                const statusMatch = statusOutputRes.output.match(/Status\s+=\s+(\w+)/);
                const status = statusMatch ? statusMatch[1] : 'unknown';
                if (status !== 'running') {
                    nomadStatus = '⚠️ WARNING';
                }
                nomadProofs.push(`${job} (${status})`);
            } else {
                nomadStatus = '🔴 FAILED';
                nomadProofs.push(`${job} (SSH failed)`);
            }
        }

        features.push({
            name: 'Nomad Orchestration Health',
            status: nomadStatus,
            checkedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
            proof: `Scheduler online. Job status: ${nomadProofs.join(', ')}`
        });

        // ----------------------------------------------------
        // Generate Markdown Report
        // ----------------------------------------------------
        console.log('\nGenerating FEATURE_CATALOG.md...');
        let markdownContent = `# 🛠️ PWF RSRCH Feature Integrity & Capability Catalog\n\n`;
        markdownContent += `Tento katalog slouží jako **automaticky vygenerovaný a verifikovaný důkaz** funkčnosti všech klíčových systémových vlastností PWF RSRCH.\n\n`;
        markdownContent += `> [!IMPORTANT]\n`;
        markdownContent += `> Všechna data v tabulce byla získána přímým a živým dotazováním v době generování reportu.\n\n`;
        markdownContent += `### 📋 Přehled featur a verifikačních důkazů\n\n`;
        markdownContent += `| Feature / Komponenta | Status | Čas ověření | Živý verifikační důkaz (Live Verifiable Proof) |\n`;
        markdownContent += `| :--- | :---: | :---: | :--- |\n`;

        for (const f of features) {
            markdownContent += `| **${f.name}** | ${f.status} | \`${f.checkedAt}\` | \`${f.proof.replace(/`/g, "'")}\` |\n`;
        }

        markdownContent += `\n\n---\n*Generováno automaticky pomocí \`rsrch verify\` dne ${new Date().toLocaleString('cs-CZ')}*`;

        try {
            fs.writeFileSync(outputPath, markdownContent, 'utf-8');
            console.log(`\x1b[32mSuccessfully wrote catalog to ${outputPath}\x1b[0m\n`);
        } catch (e: any) {
            console.error(`\x1b[31mFailed to write catalog file: ${e.message}\x1b[0m\n`);
        }

        // Print nice console result summary
        console.log('\x1b[1m=== VERIFICATION SUMMARY ===\x1b[0m');
        for (const f of features) {
            const statusColor = f.status.includes('🟢') ? '\x1b[32m' : f.status.includes('⚠️') ? '\x1b[33m' : '\x1b[31m';
            console.log(`${statusColor}${f.status}\x1b[0m \x1b[1m${f.name}\x1b[0m`);
            console.log(`   └─ Proof: \x1b[90m${f.proof}\x1b[0m`);
        }
        console.log('');
    });
