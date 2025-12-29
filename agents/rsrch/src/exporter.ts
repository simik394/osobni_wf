/**
 * Exporter - Export conversations to Markdown and JSON files
 * 
 * Provides:
 * - exportToMarkdown() - Convert conversation to Obsidian-compatible markdown
 * - exportToJson() - Export conversation as JSON
 * - exportBulk() - Export multiple conversations to a directory
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getGraphStore } from './graph-store';

// Types matching graph-store and gemini-client

export interface ExportTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
    thinking?: string;
}

export interface ExportSource {
    id: number;
    text: string;
    url: string;
    domain: string;
}

export interface ExportResearchDoc {
    title: string;
    content: string;
    sources: ExportSource[];
    reasoningSteps: Array<{ phase: string; action: string }>;
}

export interface ExportConversation {
    platform: 'gemini' | 'perplexity';
    platformId: string;
    title: string;
    type: 'regular' | 'deep-research';
    turns: ExportTurn[];
    researchDocs?: ExportResearchDoc[];
    capturedAt: number;
    createdAt?: number;
}

export interface ExportOptions {
    format: 'md' | 'json';
    outputDir?: string;
    includeResearchDocs?: boolean;
    includeThinking?: boolean;
}

export interface ExportResult {
    success: boolean;
    path: string;
    contentHash: string;
    exportedAt: number;
}

/**
 * Compute content hash for change detection
 */
export function computeContentHash(conversation: ExportConversation): string {
    const content = JSON.stringify({
        turns: conversation.turns.map(t => ({ role: t.role, content: t.content })),
        researchDocs: conversation.researchDocs?.map(d => ({ title: d.title, content: d.content })) || []
    });
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Format timestamp to ISO date string
 */
function formatTimestamp(ts: number): string {
    return new Date(ts).toISOString();
}

/**
 * Export a conversation to Markdown format
 */
export function exportToMarkdown(conversation: ExportConversation, options: Partial<ExportOptions> = {}): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push('---');
    lines.push(`platform: ${conversation.platform}`);
    lines.push(`sessionId: ${conversation.platformId}`);
    lines.push(`title: "${conversation.title.replace(/"/g, '\\"')}"`);
    lines.push(`type: ${conversation.type}`);
    lines.push(`exportedAt: ${formatTimestamp(Date.now())}`);
    lines.push(`capturedAt: ${formatTimestamp(conversation.capturedAt)}`);
    if (conversation.createdAt) {
        lines.push(`createdAt: ${formatTimestamp(conversation.createdAt)}`);
    }
    lines.push(`contentHash: ${computeContentHash(conversation)}`);
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${conversation.title}`);
    lines.push('');

    // Conversation section
    lines.push('## Conversation');
    lines.push('');

    for (const turn of conversation.turns) {
        const roleLabel = turn.role === 'user' ? 'User' : 'Assistant';
        lines.push(`### ${roleLabel}`);
        if (turn.timestamp) {
            lines.push(`*${formatTimestamp(turn.timestamp)}*`);
        }
        lines.push('');
        lines.push(turn.content);
        lines.push('');

        // Include thinking/reasoning if present
        if (options.includeThinking && turn.thinking) {
            lines.push('#### Thinking');
            lines.push('');
            lines.push('> ' + turn.thinking.split('\n').join('\n> '));
            lines.push('');
        }
    }

    // Research Documents section (for deep research)
    if (options.includeResearchDocs !== false && conversation.researchDocs && conversation.researchDocs.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('## Research Documents');
        lines.push('');

        for (const doc of conversation.researchDocs) {
            lines.push(`### ${doc.title}`);
            lines.push('');
            lines.push(doc.content);
            lines.push('');

            // Reasoning steps
            if (doc.reasoningSteps && doc.reasoningSteps.length > 0) {
                lines.push('#### Reasoning Steps');
                lines.push('');
                for (const step of doc.reasoningSteps) {
                    lines.push(`- **${step.phase}**: ${step.action}`);
                }
                lines.push('');
            }

            // Sources used (collapsed in markdown with details tag)
            if (doc.sources && doc.sources.length > 0) {
                lines.push('<details>');
                lines.push('<summary>Sources Used</summary>');
                lines.push('');
                lines.push('| # | Title | URL |');
                lines.push('|---|-------|-----|');
                for (const src of doc.sources) {
                    const domain = src.domain || new URL(src.url).hostname;
                    lines.push(`| ${src.id} | ${src.text} | [${domain}](${src.url}) |`);
                }
                lines.push('');
                lines.push('</details>');
                lines.push('');
            }
        }
    }

    return lines.join('\n');
}

/**
 * Export a conversation to JSON format
 */
export function exportToJson(conversation: ExportConversation): string {
    const output = {
        ...conversation,
        exportedAt: Date.now(),
        contentHash: computeContentHash(conversation)
    };
    return JSON.stringify(output, null, 2);
}

/**
 * Generate a safe filename from conversation title
 */
function safeFilename(title: string, platformId: string): string {
    const safe = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 50)
        .replace(/^-|-$/g, '');
    return safe || platformId;
}

/**
 * Export a conversation to a file
 */
export async function exportToFile(
    conversation: ExportConversation,
    options: ExportOptions
): Promise<ExportResult> {
    const format = options.format || 'md';
    const outputDir = options.outputDir || './exports';

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate content
    const content = format === 'json'
        ? exportToJson(conversation)
        : exportToMarkdown(conversation, options);

    // Generate filename
    const filename = `${safeFilename(conversation.title, conversation.platformId)}.${format}`;
    const filepath = path.join(outputDir, filename);

    // Write file
    fs.writeFileSync(filepath, content, 'utf-8');

    return {
        success: true,
        path: filepath,
        contentHash: computeContentHash(conversation),
        exportedAt: Date.now()
    };
}

/**
 * Export multiple conversations from graph store
 */
export async function exportBulk(
    platform: 'gemini' | 'perplexity',
    options: ExportOptions & {
        since?: number;  // Export only conversations captured after this timestamp
        limit?: number;
    }
): Promise<ExportResult[]> {
    const graphStore = getGraphStore();
    await graphStore.connect();

    try {
        // Get conversations from graph store
        // If since is provided, utilize the optimized delta query
        const conversations = options.since
            ? await graphStore.getChangedConversations(options.since)
            : await graphStore.getConversationsByPlatform(platform, options.limit || 50);

        const results: ExportResult[] = [];

        for (const conv of conversations) {
            // Skip if older than since parameter
            if (options.since && (conv.capturedAt || 0) < options.since) {
                continue;
            }

            // Get full conversation with research docs
            const full = await graphStore.getConversationWithFilters(conv.id, {
                includeResearchDocs: true
            });

            if (!full || !full.turns || !full.conversation) continue;

            // Build export object
            const exportConv: ExportConversation = {
                platform,
                platformId: conv.platformId || conv.id,
                title: full.conversation.title || conv.title || 'Untitled',
                type: (full.conversation.type || conv.type || 'regular') as 'regular' | 'deep-research',
                turns: full.turns.map(t => ({
                    role: t.role as 'user' | 'assistant',
                    content: t.content,
                    timestamp: t.timestamp
                })),
                researchDocs: full.researchDocs?.map(d => ({
                    title: d.title,
                    content: d.content,
                    sources: d.sources || [],
                    reasoningSteps: d.reasoningSteps || []
                })),
                capturedAt: conv.capturedAt || 0,
                createdAt: conv.createdAt
            };

            // Export to file
            const result = await exportToFile(exportConv, options);

            // Update graph with last exported timestamp
            await graphStore.updateLastExportedAt(conv.id, result.exportedAt);

            results.push(result);
        }

        return results;
    } finally {
        await graphStore.disconnect();
    }
}

/**
 * Get conversations that have changed since a given date
 */
export async function getChangedConversations(
    platform: 'gemini' | 'perplexity',
    since: number
): Promise<Array<{ id: string; platformId: string; title: string; capturedAt: number }>> {
    const graphStore = getGraphStore();
    await graphStore.connect();

    try {
        const all = await graphStore.getConversationsByPlatform(platform, 100);
        return all.filter(c => c.capturedAt > since);
    } finally {
        await graphStore.disconnect();
    }
}
