import { GeminiClient } from './src/clients/gemini';
import { BrowserClient } from './src/clients/base';
import { config } from './src/config';

async function test() {
    console.log('--- Testing Gemini Canvas Features ---');
    const browser = new BrowserClient();
    await browser.init({ profileId: 'default' });
    const gemini = await browser.createGeminiClient();
    await gemini.init();

    try {
        console.log('1. Creating an artifact...');
        await gemini.sendMessage('create a short python script for calculating factorials in canvas');
        await gemini.wait(5000);

        console.log('2. Listing artifacts...');
        const artifacts = await gemini.listArtifacts();
        console.log('Artifacts:', JSON.stringify(artifacts, null, 2));

        console.log('3. Reading canvas...');
        const content = await gemini.readCanvas();
        console.log('Title:', content?.title);

        console.log('4. Sending prompt to canvas...');
        const prompted = await gemini.promptCanvas('add a docstring and comments');
        console.log('Prompted:', prompted);
        await gemini.wait(5000);

        console.log('5. Listing versions...');
        const versions = await gemini.listCanvasVersions();
        console.log('Versions:', JSON.stringify(versions, null, 2));

        if (versions.length > 1) {
            console.log('6. Restoring previous version...');
            const restored = await gemini.restoreCanvasVersion(versions[1].id);
            console.log('Restored:', restored);
        }

        console.log('7. Exporting to docs...');
        const exported = await gemini.exportCanvas('docs');
        console.log('Exported:', exported);

    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await browser.release();
    }
}

test();
