import { PerplexityClient } from '../../../src/client';
import { NotebookLMClient } from '../../../src/notebooklm-client';

export async function main(
    browser_ws_endpoint: string,
    notebook_title: string,
    sources_or_range: string
) {
    console.log(`[Windmill] Selecting sources "${sources_or_range}" in notebook "${notebook_title}"...`);
    const client = new PerplexityClient();
    await client.init({ cdpEndpoint: browser_ws_endpoint, local: false });

    try {
        const notebookClient: NotebookLMClient = await client.createNotebookClient();
        await notebookClient.openNotebook(notebook_title);
        await notebookClient.selectSources(sources_or_range);
        console.log('[Windmill] Success.');
        return { success: true, notebook: notebook_title, selected: sources_or_range };
    } catch (e: any) {
        console.error('[Windmill] Failed:', e.message);
        throw e;
    } finally {
        await client.close();
    }
}
