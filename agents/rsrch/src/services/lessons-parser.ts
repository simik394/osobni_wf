import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

export interface ParsedLesson {
    id: string;
    title: string;
    topics: string[];
    problem: string;
    solution: string;
    rawContent: string;
    referenceUrl?: string;
}

/**
 * Classify a lesson into topics based on keywords in title and content
 */
function classifyTopics(title: string, content: string): string[] {
    const combined = `${title} ${content}`.toLowerCase();
    const topicMap: Record<string, string[]> = {
        'Gemini': ['gemini', 'sge', 'ai mode'],
        'NotebookLM': ['notebooklm', 'notebook lm', 'audio', 'podcast', 'source'],
        'Perplexity': ['perplexity'],
        'Docker': ['docker', 'container', 'compose', 'registry'],
        'Ansible': ['ansible'],
        'Wine': ['wine', 'remarkable', 'xvfb', 'wineserver'],
        'Playwright': ['playwright', 'selector', 'cdp', 'browser', 'page.', 'locator'],
        'Architecture': ['architecture', 'modular', 'sidecar', 'principal', 'monolith', 'refactor', 'structure'],
        'Dashboard': ['dashboard', 'quarto', 'ojs', 'mermaid', 'interactive'],
        'Jules': ['jules', 'autonomy', 'sandbox']
    };

    const matchedTopics: string[] = [];
    for (const [topic, keywords] of Object.entries(topicMap)) {
        if (keywords.some(kw => combined.includes(kw))) {
            matchedTopics.push(topic);
        }
    }

    if (matchedTopics.length === 0) {
        matchedTopics.push('General');
    }

    return matchedTopics;
}

/**
 * Clean up text markdown (stripping excessive indentation or markdown markers if needed)
 */
function cleanText(text: string): string {
    return text.trim();
}

/**
 * Generate a safe unique ID/slug from string
 */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/**
 * Parse docs/LESSONS_LEARNED.md into structured lessons
 */
export async function parseLessonsLearned(filePath: string): Promise<ParsedLesson[]> {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const lessons: ParsedLesson[] = [];
    let currentBlock: string[] = [];
    let currentTitle = '';
    let currentRefUrl: string | undefined = undefined;

    const saveCurrentLesson = () => {
        if (currentTitle && currentBlock.length > 0) {
            const blockContent = currentBlock.join('\n');
            const topics = classifyTopics(currentTitle, blockContent);
            const slug = slugify(currentTitle);

            // Structure extraction logic
            let problem = '';
            let solution = '';

            // Try to extract explicitly named sections
            const problemRegexes = [
                /- \*\*Problem\*\*:\s*([\s\S]*?)(?=- \*\*|$)/i,
                /## Incident:\s*([\s\S]*?)(?=###|$)/i,
                /### Context\s*([\s\S]*?)(?=###|$)/i,
                /### Root Cause\s*([\s\S]*?)(?=###|$)/i,
                /> \*\*Context\*\*:\s*([\s\S]*?)(?=####|$)/i,
                /\*\*Problem\*\*:\s*([\s\S]*?)(?=\*\*|$)/i
            ];

            const solutionRegexes = [
                /- \*\*Solution\*\*:\s*([\s\S]*?)(?=- \*\*|$)/i,
                /### Lessons\s*([\s\S]*?)(?=###|$)/i,
                /### Action Items\s*([\s\S]*?)(?=###|$)/i,
                /#### RULES\s*([\s\S]*?)(?=###|$)/i,
                /#### LESSONS LEARNED:\s*([\s\S]*?)(?=###|$)/i,
                /\*\*Solution\*\*:\s*([\s\S]*?)(?=\*\*|$)/i
            ];

            for (const r of problemRegexes) {
                const match = blockContent.match(r);
                if (match && match[1]) {
                    problem += match[1].trim() + '\n\n';
                }
            }

            for (const r of solutionRegexes) {
                const match = blockContent.match(r);
                if (match && match[1]) {
                    solution += match[1].trim() + '\n\n';
                }
            }

            problem = cleanText(problem);
            solution = cleanText(solution);

            // Fallback: If no structured problem/solution were parsed, split by midpoint or bullet points
            if (!problem || !solution) {
                const lines = blockContent.split('\n');
                const bulletLines = lines.filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./));
                
                if (bulletLines.length >= 2) {
                    // Treat first half of bullet points as problem context, second half as solutions
                    const splitIdx = Math.ceil(bulletLines.length / 2);
                    if (!problem) {
                        problem = bulletLines.slice(0, splitIdx).join('\n');
                    }
                    if (!solution) {
                        solution = bulletLines.slice(splitIdx).join('\n');
                    }
                } else {
                    // Fallback to splitting total text
                    if (!problem) {
                        problem = `Context for: ${currentTitle}`;
                    }
                    if (!solution) {
                        solution = blockContent;
                    }
                }
            }

            lessons.push({
                id: slug,
                title: currentTitle,
                topics,
                problem,
                solution,
                rawContent: blockContent,
                referenceUrl: currentRefUrl
            });
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match H3 header with [[Lesson Title]]
        // e.g., ### [[7. Modular Action Pattern (2026-04-02)]](file:///home/sim/...)
        const headerMatch = line.match(/^###\s+\[\[(.*?)\]\](?:\((.*?)\))?/);
        
        if (headerMatch) {
            // Save the previous block before starting the new one
            saveCurrentLesson();

            currentTitle = headerMatch[1].trim();
            currentRefUrl = headerMatch[2] ? headerMatch[2].trim() : undefined;
            currentBlock = [];
        } else {
            if (currentTitle) {
                currentBlock.push(line);
            }
        }
    }

    // Save final lesson
    saveCurrentLesson();

    logger.info(`[LessonsParser] Successfully parsed ${lessons.length} structured lessons from ${filePath}`);
    return lessons;
}
