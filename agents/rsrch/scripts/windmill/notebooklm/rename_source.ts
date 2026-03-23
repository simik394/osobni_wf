import { PerplexityClient } from '../../../src/client';
import { NotebookLMClient } from '../../../src/notebooklm-client';

export async function main(
    browser_ws_endpoint: string,
    notebook_title: string,
    old_title: string,
    new_title: string
) {
    console.log(`[Windmill] Renaming source "${old_title}" to "${new_title}" in notebook "${notebook_title}"...`);
    const client = new PerplexityClient();
    await client.init({ cdpEndpoint: browser_ws_endpoint, local: false });

    try {
        const notebookClient: NotebookLMClient = await client.createNotebookClient();
        await notebookClient.openNotebook(notebook_title);
        await notebookClient.renameSource(old_title, new_title);
        console.log('[Windmill] Success.');
        return { success: true, notebook: notebook_title, renamed_source: new_title };
    } catch (e: any) {
        console.error('[Windmill] Failed:', e.message);
        throw e;
    } finally {
        await client.close();
    }
}
