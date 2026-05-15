import { UniversalContext, NotebookLMActionDeps } from '../types';
import { ensureGoogleAuthAction } from '../google-auth';

/**
 * Proactively handles Google authentication redirects for NotebookLM.
 * Detects 'Choose an account' pages and automatically selects the primary account.
 */
export async function ensureAuthAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<boolean> {
    try {
        return await ensureGoogleAuthAction(ctx, deps);
    } catch (error: any) {
        if (error.message.includes('rejected')) {
            // Specialized handling for rejection in NotebookLM
            if (deps.dumpState) await deps.dumpState('auth_rejected');
        }
        throw error;
    }
}
