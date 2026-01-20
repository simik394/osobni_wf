
import { describe, it, expect } from 'vitest';
import { executeGeminiStream } from '../src/cli-utils';

// Only run if integration test flag is set, as this hits the production server
const runIntegration = process.env.TEST_INTEGRATION === 'true';

describe.skipIf(!runIntegration)('Gemini Streaming Integration', () => {

    it('should stream thoughts from a reasoning query', async () => {
        const query = "Solve 25 * 44 with detailed thoughts";
        const serverUrl = 'http://halvarm:3030';

        console.log(`Testing query: "${query}" against ${serverUrl}`);

        let fullText = '';
        let thoughtBlockDetected = false;

        await executeGeminiStream('chat', { message: query }, { server: serverUrl }, (data) => {
            if (data.type === 'progress' && data.text) {
                fullText = data.text;
                // Check for common thought indicators
                if (data.text.includes('Thought Process') ||
                    data.text.includes('Myšlenkový proces') ||
                    data.text.includes('Reasoning')) {
                    thoughtBlockDetected = true;
                }
            }
        });

        console.log('Final Text Length:', fullText.length);
        console.log('Thought Block Detected:', thoughtBlockDetected);

        expect(fullText.length).toBeGreaterThan(0);
        // We expect some reasoning for a "with detailed thoughts" prompt
        // Note: The model might vary in exact wording, but usually explicit prompts trigger it.
        // We strictly check if the loop logic found "Thought Process" or we just have a long response.
        // The thought block is what we specifically patched.
        expect(thoughtBlockDetected).toBe(true);
    }, 60000); // Long timeout for LLM generation
});
