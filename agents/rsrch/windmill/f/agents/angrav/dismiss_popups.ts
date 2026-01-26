/**
 * Windmill Script: Dismiss Antigravity Popups
 * 
 * Dismisses common startup popups in Antigravity IDE.
 * Can be run as a scheduled task or before other operations.
 * 
 * @returns List of dismissed popups
 */

import { dismissAllPopups } from '/w/agents/angrav/src/dismiss-popups';

export async function main(): Promise<{
    dismissed: string[];
    errors: string[];
}> {
    console.log('🧹 Dismissing Antigravity popups...');

    const cdpEndpoint = process.env.BROWSER_CDP_ENDPOINT || 'http://angrav-browser:9223';

    const result = await dismissAllPopups(cdpEndpoint);

    if (result.dismissed.length > 0) {
        console.log(`✅ Dismissed: ${result.dismissed.join(', ')}`);
    }

    if (result.errors.length > 0) {
        console.log(`⚠️ Errors: ${result.errors.join(', ')}`);
    }

    if (result.dismissed.length === 0 && result.errors.length === 0) {
        console.log('✓ No popups found');
    }

    return result;
}
