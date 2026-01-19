export interface Trigger {
    type: 'schedule' | 'event';
    cron?: string;
    event?: string;
}

export interface WorkflowStep {
    id: string;
    agent: 'gemini' | 'perplexity' | 'notebooklm';
    action: 'query' | 'deep-research' | 'audio' | 'export';
    params: Record<string, any>;
    dependsOn?: string[];
    condition?: string;
}

export interface Workflow {
    name: string;
    description?: string;
    steps: WorkflowStep[];
    triggers?: Trigger[];
}

export interface WorkflowExecution {
    id: string;
    workflowName: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    results: Record<string, any>;
    stepStatus: Record<string, StepExecution>;
    error?: string;
}

export interface StepExecution {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: number;
    endTime?: number;
    result?: any;
    error?: string;
}
