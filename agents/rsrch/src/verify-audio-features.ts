
import { PerplexityClient } from './client';
import path from 'path';
import fs from 'fs';

async function main() {
    const client = new PerplexityClient();
    await client.init();
    try {
        const nb = await client.createNotebookClient();
        console.log('Opening notebook...');
        await nb.openNotebook("The Evolution of Czech Scouting");

        // 1. Verify Names (Exportability)
        console.log('--- Testing Audio Name Extraction ---');
        // Casting to any to access private method for verification
        const overviews = await (nb as any).extractAudioOverviews();
        console.log('Audio Overviews found:', JSON.stringify(overviews, null, 2));

        // DEBUG: Dump all artifacts to see what IS there
        const allArtifacts = (nb as any).page.locator('artifact-library-item');
        const count = await allArtifacts.count();
        console.log(`\n[DEBUG] Total artifact-library-items found: ${count}`);
        for (let i = 0; i < count; i++) {
            console.log(`Artifact ${i}: "${await allArtifacts.nth(i).innerText()}"`);
        }

        // DEBUG: Screenshot
        await (nb as any).page.screenshot({ path: 'verify_debug.png' });
        console.log('Saved verify_debug.png');

        if (overviews.length === 0) {
            console.log('No audio overviews found. Checking for "Generate" button...');
            // Check for generate button
            const generateBtn = (nb as any).page.getByRole('button', { name: /Generate|Vytvořit/i });
            if (await generateBtn.count() > 0 && await generateBtn.first().isVisible()) {
                console.log('Found "Generate" button. Audio not yet created.');
            }
            return;
        }

        // 2. Verify Single Download (Targeting by name)
        const target = overviews[0];
        console.log(`\n--- Testing Single Audio Download (Target: "${target.title}") ---`);

        const outputPath = path.resolve(process.cwd(), 'test_audio_download.mp3');
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        // We pass null for notebookTitle since we are already on the page, 
        // BUT downloadAudio might expect it. checking implementation...
        // Implementation: if (notebookTitle) await this.openNotebook(notebookTitle);
        // It's safer to pass the title to ensure state, but let's try to rely on current state if possible?
        // Actually, re-opening is fine, it usually checks if URL matches.

        const success = await nb.downloadAudio(
            "The Evolution of Czech Scouting",
            outputPath,
            { audioTitlePattern: target.title }
        );

        console.log(`Download operation result: ${success}`);

        if (success && fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`SUCCESS: File saved at: ${outputPath}`);
            console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        } else {
            console.error('FAILURE: File was not downloaded.');
        }

    } catch (e) {
        console.error('Verification failed:', e);
    } finally {
        await client.close();
    }
}

main();
