import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { config } from '../config';

export interface FeatureStatus {
    name: string;
    status: 'Production' | 'Beta' | 'Legacy' | 'Planned';
    pattern: 'Modular' | 'Monolithic' | 'Proposed';
    actions: number;
    spec?: string;
}

export interface DashboardMetrics {
    totalActions: number;
    clientHealth: number; // % modular
    authStatus: string;
    lastUpdated: string;
    features: FeatureStatus[];
    halvarmStatus: string;
    gitStatus: string;
    falkorStatus: string;
}

export class DashboardService {
    private rootDir: string;

    constructor() {
        this.rootDir = path.resolve(__dirname, '../../');
    }

    public async getStatus(): Promise<DashboardMetrics> {
        const features: FeatureStatus[] = [];
        
        // 1. Audit Gemini
        const geminiActions = this.countActions('gemini');
        features.push({
            name: 'Gemini Research',
            status: 'Production',
            pattern: 'Modular',
            actions: geminiActions,
            spec: 'gemini_parser_spec.md'
        });

        // 2. Audit NotebookLM
        const notebookActions = this.countActions('notebooklm');
        features.push({
            name: 'NotebookLM Audio',
            status: 'Beta',
            pattern: 'Modular',
            actions: notebookActions,
            spec: 'notebooklm_scraper_spec.md'
        });

        // 3. Audit Perplexity
        const perplexityActions = this.countActions('perplexity');
        features.push({
            name: 'Perplexity Search',
            status: 'Production',
            pattern: perplexityActions > 0 ? 'Modular' : 'Monolithic',
            actions: perplexityActions,
            spec: 'conversation_scraper_spec.md'
        });
 
        // 4. Audit Graph Store
        const graphActions = this.countActions('graph'); // or check src/core/graph-store.ts exists
        features.push({
            name: 'Graph Store (FalkorDB)',
            status: 'Beta',
            pattern: 'Modular',
            actions: graphActions || 1, // Assume 1 for the main store
            spec: 'graph_store_spec.md'
        });
 
        const totalActions = geminiActions + notebookActions + perplexityActions + (graphActions || 1);

        const totalPotentialModular = 4; // Gemini, NotebookLM, Perplexity, Graph
        const modularCount = features.filter(f => f.pattern === 'Modular').length;
        
        // --- System & Control Metrics ---
        let halvarmStatus = "Unknown";
        let falkorStatus = "Unknown";
        let gitStatus = "Clean";

        // Halvarm Check
        try {
            const sshResult = execSync('ssh -o BatchMode=yes -o ConnectTimeout=2 halvarm "curl -s http://localhost:3030/health || echo offline"', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
            if (sshResult.includes('"status":"ok"')) {
                halvarmStatus = "Online (API OK)";
                falkorStatus = "Online"; // Assuming health check includes Falkor
            } else if (sshResult.includes('offline')) {
                halvarmStatus = "Online (API Down)";
            } else {
                halvarmStatus = sshResult.trim().substring(0, 20);
            }
        } catch(e) {
            halvarmStatus = "Unreachable";
            falkorStatus = "Unreachable";
        }

        // Falkor Local check
        try {
            if (falkorStatus === "Unknown") {
                const redisRes = execSync('redis-cli -p 6379 ping 2>/dev/null', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
                if (redisRes.includes('PONG')) falkorStatus = "Online (Local)";
            }
        } catch (e) {
            if (falkorStatus === "Unknown") falkorStatus = "Offline";
        }

        // Git Check
        try {
            const gitRes = execSync('git status --porcelain', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
            const lineCount = gitRes.trim().split('\\n').filter(l => l.length > 0).length;
            if (lineCount > 0) {
                gitStatus = `${lineCount} unstaged/uncommitted files`;
            }
        } catch(e) {
            gitStatus = "Error parsing git";
        }

        return {
            totalActions,
            clientHealth: Math.round((modularCount / totalPotentialModular) * 100),
            authStatus: 'Active (VNC Locked)',
            lastUpdated: new Date().toISOString(),
            features,
            halvarmStatus,
            gitStatus,
            falkorStatus
        };
    }

    private countActions(service: string): number {
        const actionsDir = path.join(this.rootDir, 'src/actions', service);
        if (fs.existsSync(actionsDir)) {
            return fs.readdirSync(actionsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts').length;
        }
        return 0;
    }
}

export const dashboardService = new DashboardService();
