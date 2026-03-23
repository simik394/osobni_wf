import { PerplexityClient } from '../../../src/client';
import { NotebookLMClient } from '../../../src/notebooklm-client';

export async function main(
    browser_ws_endpoint: string,
    notebook_title: string,
    artifact_title: string,
    output_path_or_dir: string,
    latest_only: boolean = false,
    is_pattern: boolean = false
) {
    console.log(`[Windmill] Downloading artifact "${artifact_title}" in notebook "${notebook_title}"...`);
    const client = new PerplexityClient();
    await client.init({ cdpEndpoint: browser_ws_endpoint, local: false });

    try {
        const notebookClient: NotebookLMClient = await client.createNotebookClient();
        const success = await notebookClient.downloadArtifact(notebook_title, artifact_title, output_path_or_dir, {
            latestOnly: latest_only,
            isPattern: is_pattern
        });
        console.log(`[Windmill] Download ${success ? 'succeeded' : 'failed'}.`);
        return { success, notebook: notebook_title, artifact: artifact_title };
    } catch (e: any) {
        console.error('[Windmill] Failed:', e.message);
        throw e;
    } finally {
        await client.close();
    }
}
