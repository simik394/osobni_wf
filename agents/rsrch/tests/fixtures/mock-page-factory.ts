
import { vi, Mock } from 'vitest';
import { Page, Locator } from 'playwright';

/**
 * Creates a robust mock Locator for testing
 */
export const createMockLocator = (
    options: {
        visible?: boolean;
        count?: number;
        text?: string | string[];
        html?: string | string[];
        attributes?: Record<string, string>;
        name?: string; // Debug name
    } = {}
) => {
    const name = options.name || 'AnonymousLocator';
    const isVisible = options.visible !== false; // Default true
    const count = options.count ?? (isVisible ? 1 : 0);
    const texts = Array.isArray(options.text) ? options.text : (options.text ? [options.text] : []);
    const htmls = Array.isArray(options.html) ? options.html : (options.html ? [options.html] : []);

    const locator = {
        count: vi.fn().mockImplementation(async () => {
            // console.log(`[MockLocator:${name}] count() -> ${count}`);
            return count;
        }),
        isVisible: vi.fn().mockResolvedValue(isVisible),
        innerText: vi.fn().mockImplementation(async () => texts[0] || ''),
        textContent: vi.fn().mockImplementation(async () => texts[0] || ''),
        innerHTML: vi.fn().mockImplementation(async () => htmls[0] || ''),
        getAttribute: vi.fn().mockImplementation(async (attr) => {
            const val = options.attributes?.[attr] || null;
            // console.log(`[MockLocator:${name}] getAttribute(${attr}) -> ${val} (Attributes: ${JSON.stringify(options.attributes)})`);
            return val;
        }),

        // Navigation / Iteration
        first: vi.fn().mockReturnThis(),
        last: vi.fn().mockReturnThis(),
        nth: vi.fn().mockImplementation((i) => {
            // console.log(`[MockLocator:${name}] nth(${i}) invoked`);
            // Return a new mock locator specific to this index if we have array data
            if (texts[i] || htmls[i]) {
                // console.log(`[MockLocator:${name}] nth(${i}) creating child locator`);
                return createMockLocator({
                    ...options,
                    count: 1,
                    text: texts[i],
                    html: htmls[i],
                    name: `${name}:child:${i}`
                });
            }
            return locator;
        }),

        // Actions
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        press: vi.fn().mockResolvedValue(undefined),
        waitFor: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation((fn, arg) => {
            if (typeof fn === 'function') {
                const node = {
                    innerText: texts[0] || '',
                    innerHTML: htmls[0] || '',
                    textContent: texts[0] || ''
                };
                return fn(node, arg);
            }
            return undefined;
        }),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    };

    return locator;
};

/**
 * Mocks the Gemini Client page with specific selectors for research parsing
 */
export interface MockData {
    title: string;
    query: string;
    contentHtml: string;
    contentText: string;
    citations: Array<{ text: string, href: string }>;
    headings: string[];
    reasoning: string[];
}

export const createResearchMockPage = (customData?: Partial<MockData>) => {
    // Default Data
    const data: MockData = {
        title: customData?.title ?? 'Research Title',
        query: customData?.query ?? 'Tell me about quantum computing',
        contentHtml: customData?.contentHtml ?? `
            <h1>Research Title</h1>
            <p>Quantum computing uses <a href="https://example.com/qc">quantum mechanics</a>.</p>
            <div class="research-status">Analyzing physics...</div>
            <h2>Section 1</h2>
            <p>Superposition is key.</p>
        `,
        contentText: customData?.contentText ?? 'Research Title\nQuantum computing uses quantum mechanics.\nAnalyzing physics...\nSection 1\nSuperposition is key.',
        citations: customData?.citations ?? [
            { text: 'quantum mechanics', href: 'https://example.com/qc' }
        ],
        headings: customData?.headings ?? ['Research Title', 'Section 1', 'Section 2'],
        reasoning: customData?.reasoning ?? ['Analyzing physics...']
    };

    // Default fallback locator
    const emptyLocator = createMockLocator({ visible: false, count: 0, name: 'EmptyLocator' });

    const mockPage = {
        goto: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        waitForSelector: vi.fn().mockResolvedValue(null),
        url: vi.fn().mockReturnValue('https://gemini.google.com/app/12345'),
        title: vi.fn().mockReturnValue('Gemini - Deep Research Test'),
        evaluate: vi.fn().mockImplementation((fn) => {
            // Mock stability check
            return Promise.resolve('stable');
        }),
        locator: vi.fn().mockImplementation((selector: string) => {
            // Mocks for parseResearch extraction

            // 1. Immersive view check
            if (selector.includes('.immersives-open')) {
                return createMockLocator({ count: 1, name: 'ImmersiveCheck' });
            }

            // 2. Headings
            if (selector.includes('model-response h1')) {
                return createMockLocator({
                    count: data.headings.length,
                    text: data.headings,
                    name: 'Headings'
                });
            }

            // 3. User Query
            if (selector.includes('user-message') || selector.includes('user-query')) {
                return createMockLocator({
                    count: 1,
                    text: data.query,
                    name: 'UserQuery'
                });
            }

            // 5. Links (Citations)
            // Note: The selector in gemini-client is 'model-response a[href^="http"], div.container a[href^="http"]'
            if (selector.includes('model-response a[href^="http"]')) {
                // console.log(`[MockPage] Returning Citations Locator for selector: ${selector}`);
                return createMockLocator({
                    count: data.citations.length,
                    text: data.citations.map(c => c.text),
                    attributes: { 'href': data.citations[0]?.href || '' }, // Mocking simple attribute access for first item
                    // Note: Ideally our mock locator should handle array attributes if we iterate, but simple case suffices
                    name: 'CitationsLink'
                });
            }

            // 4. Model Response / Content (General)
            // Logic: if it's NOT the link selector but IS the response selector
            if (selector.includes('model-response') && !selector.includes('href')) {
                return createMockLocator({
                    count: 1,
                    html: [data.contentHtml],
                    text: [data.contentText],
                    name: 'ModelResponse'
                });
            }

            // 6. Reasoning/Status
            if (selector.includes('research-status')) {
                return createMockLocator({
                    count: data.reasoning.length,
                    text: data.reasoning,
                    name: 'ReasoningStatus'
                });
            }

            // console.log(`[MockPage] Returning Empty Locator for selector: ${selector}`);
            return emptyLocator;
        }),
        keyboard: {
            press: vi.fn().mockResolvedValue(undefined),
            type: vi.fn().mockResolvedValue(undefined),
        }
    };

    return mockPage as unknown as Page;
};
