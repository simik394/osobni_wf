import { cliContext } from '../src/cli/context';
import { BrowserClient } from '../src/clients/base';
import { GeminiClient } from '../src/clients/gemini';
import { config } from '../src/config';

async function verifyGemConfig() {
    console.log('=== VERIFYING GEM CONFIGURATION (CREATE -> UPDATE -> DELETE) ===');
    
    // Connect BrowserClient
    const client = new BrowserClient({
        profileId: 'default',
        cdpEndpoint: config.browserCdpEndpoint || 'http://100.73.45.27:9223' // Fallback to halvarm
    });
    
    await client.init({ local: false, profileId: 'default', cdpEndpoint: config.browserCdpEndpoint || 'http://100.73.45.27:9223' });
    
    const gemini = await client.createGeminiClient();
    let gemId: string | null = null;
    
    try {
        // Step 1: Create a Gem
        console.log('\n--- Step 1: Create Gem ---');
        gemId = await gemini.createGem({
            name: "DeleteMe Config Test",
            instructions: "This is a temporary robot created for testing configuration capabilities."
        });
        
        if (!gemId) {
            throw new Error("Failed to create Gem. Verification aborted.");
        }
        
        // Wait a bit to ensure it is registered
        await new Promise(r => setTimeout(r, 2000));
        
        // Step 2: Update Gem
        console.log('\n--- Step 2: Update Gem ---');
        const updateSuccess = await gemini.updateGem(gemId, {
            name: "DeleteMe Config Test (Updated)",
            instructions: "The instructions have been successfully updated."
        });
        
        if (!updateSuccess) {
            throw new Error("Failed to update Gem. Verification aborted.");
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        // Step 3: Delete Gem
        console.log('\n--- Step 3: Delete Gem ---');
        const deleteSuccess = await gemini.deleteGem(gemId);
        
        if (!deleteSuccess) {
            throw new Error("Failed to delete Gem.");
        }
        
        console.log('\n--- VERIFICATION SUCCESSFUL ---');
        
    } catch (error: any) {
        console.error('\n--- VERIFICATION FAILED ---');
        console.error(error.message);
    } finally {
        await client.close();
    }
}

verifyGemConfig().catch(console.error);
