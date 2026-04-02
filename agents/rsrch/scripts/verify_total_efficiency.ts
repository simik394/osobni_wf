import { BrowserClient } from '../src/clients/base';
import { isTabBusy } from '@agents/shared/tab-pool';
import * as path from 'path';

async function verify() {
    console.log('=== STARTING TOTAL EFFICIENCY VERIFICATION ===');
    const client = new BrowserClient({ profileId: 'personal', headless: true });
    
    try {
        await client.init();
        const context = (client as any).context;
        
        const getTabs = () => context.pages();
        const getBusyCount = async () => {
            const pages = getTabs();
            let count = 0;
            for (const p of pages) {
                if (await isTabBusy(p)) count++;
            }
            return count;
        };

        console.log('\n--- 1. Perplexity (Standalone Query) ---');
        console.log(`Initial Tabs: ${getTabs().length}`);
        // We'll skip the real query for speed, but test the TabPool via client methods
        const page = await client.getTabPage('perplexity');
        console.log(`Tabs after Perplexity lease: ${getTabs().length}`);
        console.log(`Busy Tabs (should be 1): ${await getBusyCount()}`);
        await (client as any).release();
        console.log(`Busy Tabs after release (should be 0): ${await getBusyCount()}`);

        console.log('\n--- 2. NotebookLM (UI Recycling) ---');
        const notebook = await client.createNotebookLMClient();
        console.log(`Tabs after NotebookLM lease: ${getTabs().length}`);
        console.log(`Busy Tabs (should be 1): ${await getBusyCount()}`);
        
        await notebook.init();
        const initialUrl = (notebook as any).page.url();
        console.log(`Initial URL: ${initialUrl}`);
        
        console.log('Recycling...');
        await notebook.recycle();
        console.log(`URL after recycle: ${(notebook as any).page.url()}`);
        
        console.log('\n--- 3. Gemini (UI Recycling) ---');
        const gemini = await client.createGeminiClient();
        console.log(`Tabs after Gemini lease: ${getTabs().length}`);
        console.log(`Busy Tabs (should be 2): ${await getBusyCount()}`);
        
        await gemini.init();
        console.log(`Gemini URL: ${(gemini as any).page.url()}`);
        
        console.log('Recycling Gemini...');
        await gemini.recycle();
        console.log(`Gemini URL after recycle: ${(gemini as any).page.url()}`);

        console.log('\n--- 4. Explicit Release ---');
        await client.release();
        const finalBusy = await getBusyCount();
        console.log(`Final Busy Tabs (MUST be 0): ${finalBusy}`);

        if (finalBusy === 0) {
            console.log('\n✅ VERIFICATION SUCCESSFUL: All resources managed efficiently.');
        } else {
            console.error('\n❌ VERIFICATION FAILED: Leaked tabs detected!');
            process.exit(1);
        }

    } catch (e: any) {
        console.error('\n❌ VERIFICATION ERROR:', e.message);
        process.exit(1);
    } finally {
        await client.shutdown().catch(() => {});
    }
}

verify();
