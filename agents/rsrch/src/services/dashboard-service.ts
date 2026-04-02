import * as fs from 'fs';
import * as path from 'path';
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

        // 3. Audit Perplexity (Monolithic for now)
        features.push({
            name: 'Perplexity Search',
            status: 'Production',
            pattern: 'Monolithic',
            actions: 0,
            spec: 'conversation_scraper_spec.md'
        });

        // 4. Audit Graph Store
        features.push({
            name: 'Graph Store (FalkorDB)',
            status: 'Beta',
            pattern: 'Modular',
            actions: 0,
            spec: 'graph_store_spec.md'
        });

        const totalActions = geminiActions + notebookActions;
        const totalPotentialModular = 4; // Gemini, NotebookLM, Perplexity, Graph
        const modularCount = features.filter(f => f.pattern === 'Modular').length;
        
        return {
            totalActions,
            clientHealth: Math.round((modularCount / totalPotentialModular) * 100),
            authStatus: 'Active (VNC Locked)',
            lastUpdated: new Date().toISOString(),
            features
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
