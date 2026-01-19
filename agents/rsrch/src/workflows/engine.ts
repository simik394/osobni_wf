import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Workflow, WorkflowStep, WorkflowExecution, StepExecution } from './types';
import { getGraphStore } from '../graph-store';
import { PerplexityClient } from '../client';

export class WorkflowEngine {
    private workflows: Map<string, Workflow> = new Map();
    private client: PerplexityClient;
    private graphStore = getGraphStore();

    constructor(client: PerplexityClient) {
        this.client = client;
    }

    loadWorkflows(dir: string) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
        for (const file of files) {
            const content = fs.readFileSync(path.join(dir, file), 'utf-8');
            try {
                const workflow = yaml.parse(content) as Workflow;
                if (workflow.name) {
                    this.workflows.set(workflow.name, workflow);
                    console.log(`[WorkflowEngine] Loaded workflow: ${workflow.name}`);
                }
            } catch (e: any) {
                console.error(`[WorkflowEngine] Failed to load ${file}: ${e.message}`);
            }
        }
    }

    listWorkflows(): Workflow[] {
        return Array.from(this.workflows.values());
    }

    getWorkflow(name: string): Workflow | undefined {
        return this.workflows.get(name);
    }

    async execute(name: string, inputs: Record<string, any> = {}): Promise<WorkflowExecution> {
        const workflow = this.workflows.get(name);
        if (!workflow) throw new Error(`Workflow not found: ${name}`);

        const executionId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const execution: WorkflowExecution = {
            id: executionId,
            workflowName: workflow.name,
            status: 'running',
            startTime: Date.now(),
            results: {},
            stepStatus: {}
        };

        // Initialize step statuses
        for (const step of workflow.steps) {
            execution.stepStatus[step.id] = {
                id: step.id,
                status: 'pending'
            };
        }

        try {
            await this.graphStore.connect(); // Ensure connected
            await this.graphStore.createWorkflowExecution(execution);

            const pendingSteps = new Set(workflow.steps);
            const completedSteps = new Set<string>();
            const stepResults: Record<string, any> = {};

            while (pendingSteps.size > 0) {
                // Find executable steps
                const readySteps: WorkflowStep[] = [];
                for (const step of pendingSteps) {
                    const depsMet = !step.dependsOn || step.dependsOn.every(d => completedSteps.has(d));
                    if (depsMet) readySteps.push(step);
                }

                if (readySteps.length === 0) {
                    throw new Error(`Deadlock detected. Pending steps: ${Array.from(pendingSteps).map(s => s.id).join(', ')}`);
                }

                // Execute ready steps in parallel
                await Promise.all(readySteps.map(async (step) => {
                    pendingSteps.delete(step);

                    // Check condition if present
                    if (step.condition) {
                        const context = { inputs, steps: stepResults };
                        // Simple condition check: assume it's a boolean value in context or simple eval
                        // For safety, we'll just check if the interpolated string is "true"
                        const condVal = this.resolveParams(step.condition, context);
                        if (condVal !== 'true' && condVal !== true) {
                            console.log(`[Workflow] Skipping step ${step.id} (condition met)`);
                             execution.stepStatus[step.id] = {
                                id: step.id,
                                status: 'skipped',
                                startTime: Date.now(),
                                endTime: Date.now()
                            };
                            await this.graphStore.updateStepExecution(executionId, execution.stepStatus[step.id]);
                            completedSteps.add(step.id);
                            return;
                        }
                    }

                    await this.executeStep(step, execution, inputs, stepResults);
                    completedSteps.add(step.id);
                }));
            }

            execution.status = 'completed';
            execution.endTime = Date.now();
            execution.results = stepResults;
            await this.graphStore.updateWorkflowExecution(execution);

            return execution;

        } catch (e: any) {
            execution.status = 'failed';
            execution.endTime = Date.now();
            execution.error = e.message;
            await this.graphStore.updateWorkflowExecution(execution);
            throw e;
        }
    }

    private async executeStep(
        step: WorkflowStep,
        execution: WorkflowExecution,
        inputs: any,
        stepResults: any
    ): Promise<void> {
        const stepExec: StepExecution = {
            id: step.id,
            status: 'running',
            startTime: Date.now()
        };
        execution.stepStatus[step.id] = stepExec;
        await this.graphStore.updateStepExecution(execution.id, stepExec);

        try {
            const context = { inputs, steps: stepResults };
            const params = this.resolveParams(step.params, context);
            console.log(`[Workflow] Executing step ${step.id} (${step.agent}.${step.action})...`);

            let rawResult: any = null;
            let metadata: any = {};

            if (step.agent === 'gemini') {
                const gemini = await this.client.createGeminiClient();
                // Load session if provided
                await gemini.init(params.sessionId);

                if (step.action === 'query' || step.action === 'chat') {
                     rawResult = await gemini.sendMessage(params.query || params.message);
                } else if (step.action === 'deep-research') {
                    rawResult = await gemini.startDeepResearch(params.query, params.gem);
                } else if (step.action === 'upload') {
                     // params.files
                } else if (step.action === 'export') {
                    rawResult = await gemini.exportCurrentToGoogleDocs();
                }
                metadata.sessionId = gemini.getCurrentSessionId();

            } else if (step.agent === 'perplexity') {
                 if (step.action === 'query') {
                    await this.client.query(params.query, params);
                    rawResult = "Executed Perplexity Query (Text capture not fully implemented in CLI)";
                 }
            } else if (step.agent === 'notebooklm') {
                const notebook = await this.client.createNotebookClient();
                if (step.action === 'audio') {
                    // params: notebookTitle, sources, prompt
                    if (params.notebookTitle) await notebook.openNotebook(params.notebookTitle);
                    else if (params.createNotebook) await notebook.createNotebook(params.createNotebook);

                    if (params.sources) {
                         if (Array.isArray(params.sources)) {
                             for (const s of params.sources) await notebook.addSourceUrl(s);
                         }
                    }

                    // Audio generation
                    if (step.action === 'audio') {
                         rawResult = await notebook.generateAudioOverview(
                             params.notebookTitle,
                             params.sources,
                             params.prompt,
                             params.waitForCompletion !== false, // Default to true if not specified
                             params.dryRun
                         );
                    }
                } else if (step.action === 'query') {
                    // Chat with notebook
                    if (params.notebookTitle) await notebook.openNotebook(params.notebookTitle);
                    rawResult = await notebook.query(params.query);
                }
            }

            const stepOutput = {
                ...metadata,
                result: rawResult,
                toString: () => typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
            };

            stepResults[step.id] = stepOutput;
            stepExec.status = 'completed';
            stepExec.endTime = Date.now();
            stepExec.result = stepOutput;
            await this.graphStore.updateStepExecution(execution.id, stepExec);
            console.log(`[Workflow] Step ${step.id} completed.`);

        } catch (e: any) {
            console.error(`[Workflow] Step ${step.id} failed: ${e.message}`);
            stepExec.status = 'failed';
            stepExec.endTime = Date.now();
            stepExec.error = e.message;
            await this.graphStore.updateStepExecution(execution.id, stepExec);
            throw e;
        }
    }

    private resolveParams(params: any, context: any): any {
        if (typeof params === 'string') return this.interpolate(params, context);
        if (Array.isArray(params)) return params.map(p => this.resolveParams(p, context));
        if (typeof params === 'object' && params !== null) {
            const res: any = {};
            for (const k in params) res[k] = this.resolveParams(params[k], context);
            return res;
        }
        return params;
    }

    private interpolate(template: string, context: any): any {
        // Check for exact match "${var}" to preserve type
        const exactMatch = template.match(/^\$\{([^}]+)\}$/);
        if (exactMatch) {
            const val = this.getValue(exactMatch[1], context);
            return val !== undefined ? val : template;
        }

        return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
            const val = this.getValue(path, context);
            return val !== undefined ? String(val) : '';
        });
    }

    private getValue(path: string, context: any): any {
        return path.split('.').reduce((o, k) => (o || {})[k], context);
    }
}
