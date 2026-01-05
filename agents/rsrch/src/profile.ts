import * as fs from 'fs';
import * as path from 'path';

const PROFILES_BASE_DIR = process.env.PROFILES_DIR || '/opt/rsrch/profiles';

export interface ProfileInfo {
    id: string;
    authFile: string;
    stateDir: string;
    exists: boolean;
    hasAuth: boolean;
}

/**
 * Get the directory for a profile
 */
export function getProfileDir(profileId: string = 'default'): string {
    return path.join(PROFILES_BASE_DIR, profileId);
}

/**
 * Get the auth file path for a profile
 */
export function getAuthFile(profileId: string = 'default'): string {
    return path.join(getProfileDir(profileId), 'auth.json');
}

/**
 * Get the state directory for a profile (browser state, cookies, etc.)
 */
export function getStateDir(profileId: string = 'default'): string {
    return path.join(getProfileDir(profileId), 'state');
}

/**
 * Ensure profile directory exists
 */
export function ensureProfileDir(profileId: string = 'default'): string {
    const dir = getProfileDir(profileId);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Profile] Created profile directory: ${dir}`);
    }
    return dir;
}

/**
 * Get info about a profile
 */
export function getProfileInfo(profileId: string = 'default'): ProfileInfo {
    const dir = getProfileDir(profileId);
    const authFile = getAuthFile(profileId);
    const stateDir = getStateDir(profileId);

    return {
        id: profileId,
        authFile,
        stateDir,
        exists: fs.existsSync(dir),
        hasAuth: fs.existsSync(authFile)
    };
}

/**
 * List all available profiles
 */
export function listProfiles(): ProfileInfo[] {
    if (!fs.existsSync(PROFILES_BASE_DIR)) {
        return [];
    }

    const entries = fs.readdirSync(PROFILES_BASE_DIR, { withFileTypes: true });
    const profiles: ProfileInfo[] = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            profiles.push(getProfileInfo(entry.name));
        }
    }

    return profiles;
}

/**
 * Delete a profile
 */
export function deleteProfile(profileId: string): boolean {
    if (profileId === 'default') {
        console.error('[Profile] Cannot delete default profile');
        return false;
    }

    const dir = getProfileDir(profileId);
    if (!fs.existsSync(dir)) {
        console.error(`[Profile] Profile '${profileId}' does not exist`);
        return false;
    }

    fs.rmSync(dir, { recursive: true });
    console.log(`[Profile] Deleted profile: ${profileId}`);
    return true;
}

/**
 * Load storage state from a profile's auth file
 */
export function loadStorageState(profileId: string = 'default'): any | undefined {
    const authFile = getAuthFile(profileId);

    if (!fs.existsSync(authFile)) {
        console.log(`[Profile] No auth file for profile '${profileId}'`);
        return undefined;
    }

    try {
        const content = fs.readFileSync(authFile, 'utf-8');
        const state = JSON.parse(content);
        console.log(`[Profile] Loaded auth state for profile '${profileId}'`);
        return state;
    } catch (e: any) {
        console.error(`[Profile] Failed to parse auth file for '${profileId}':`, e.message);
        return undefined;
    }
}

/**
 * Save storage state to a profile's auth file
 */
export async function saveStorageState(context: any, profileId: string = 'default'): Promise<void> {
    ensureProfileDir(profileId);
    const authFile = getAuthFile(profileId);

    await context.storageState({ path: authFile });
    console.log(`[Profile] Saved auth state for profile '${profileId}' to ${authFile}`);
}
