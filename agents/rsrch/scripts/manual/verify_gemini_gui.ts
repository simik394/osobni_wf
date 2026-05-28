import { BrowserClient } from '../../src/clients/base';
import { GeminiClient } from '../../src/clients/gemini';

async function verifyProfile(profileId: string): Promise<boolean> {
    console.log(`\n--- Probing profile: "${profileId}" ---`);
    process.env.FORCE_LOCAL_BROWSER = 'true';
    process.env.HEADLESS = 'false';

    const client = new BrowserClient({
        profileId,
        headless: false,
        verbose: false
    });

    try {
        await client.init({ force: true });
        const gemini = await client.createGeminiClient();
        
        console.log(`[${profileId}] Initializing Gemini client...`);
        await gemini.init();
        console.log(`[${profileId}] ✅ Logged in successfully! Running Gemini verification...`);

        console.log("Testing sendMessage...");
        const response = await gemini.sendMessage("Hello Gemini, respond with exactly the word SUCCESS.");
        console.log(`Response received: "${response}"`);

        if (response && response.toUpperCase().includes("SUCCESS")) {
            console.log("✅ Chat interaction verified!");
        } else {
            console.warn("⚠️ Chat interaction response was unexpected.");
        }

        console.log("Testing listSessions...");
        const sessions = await gemini.listSessions({ limit: 5 });
        console.log(`Found ${sessions.length} sessions:`);
        for (const s of sessions) {
            console.log(`- [${s.id}] ${s.name} (pinned: ${s.pinned})`);
        }
        if (sessions.length > 0) {
            console.log("✅ listSessions verified!");
        } else {
            console.warn("⚠️ No sessions found or listSessions returned empty.");
        }

        console.log("Testing getModelStatus...");
        const statuses = await gemini.getModelStatus();
        console.log("Model statuses:", JSON.stringify(statuses, null, 2));
        console.log("✅ getModelStatus verified!");

        await client.shutdown();
        return true;
    } catch (e: any) {
        if (e.message.includes('authentication') || e.message.includes('Sign in') || e.message.includes('auth')) {
            console.log(`[${profileId}] ❌ Not logged in: ${e.message}`);
        } else {
            console.error(`[${profileId}] ❌ Error during verification:`, e);
        }
        await client.shutdown();
        return false;
    }
}

async function main() {
    const profiles = ['default', 'antigravity', 'chromite', 'simik', 'personal', 'work'];
    for (const profile of profiles) {
        const success = await verifyProfile(profile);
        if (success) {
            console.log(`\n🎉 Verification succeeded using profile: "${profile}"`);
            return;
        }
    }
    console.error("\n❌ None of the profiles were authenticated or successfully verified.");
}

main().catch(console.error);
