/**
 * Profile Sync - Copy browser authentication from local browsers to rsrch containers
 * 
 * Supports:
 * - Local target: Copy to ~/.config/rsrch/user-data (mounted into rsrch-chromium container)
 * - Remote target: Copy via SSH to halvarm:/opt/rsrch/profiles
 */

import { existsSync, readdirSync, copyFileSync, mkdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

export interface SyncTarget {
    name: string;
    type: 'local' | 'remote';
    browserDataPath: string;
    sshHost?: string;
    restartCommand?: string;
}

export const SYNC_TARGETS: Record<string, SyncTarget> = {
    local: {
        name: 'Local rsrch-chromium',
        type: 'local',
        browserDataPath: join(homedir(), '.rsrch/profiles/default/state'), // Playwright creates Default/ subdirectory
        restartCommand: 'docker restart rsrch'
    },
    halvarm: {
        name: 'Production (halvarm)',
        type: 'remote',
        sshHost: 'halvarm',
        browserDataPath: '/opt/rsrch/profiles/default/state',
        restartCommand: 'docker restart rsrch-browser'
    }
};

// Files and directories that contain authentication state
const AUTH_FILES = [
    'Cookies',
    'Cookies-journal',
    'Login Data',
    'Login Data-journal',
    'Web Data',
    'Web Data-journal',
];

const AUTH_DIRS = [
    'Local Storage',
    'Session Storage',
    'IndexedDB',
    'Service Worker',
];

export interface SyncResult {
    success: boolean;
    filesTransferred: string[];
    dirsTransferred: string[];
    errors: string[];
    targetRestartNeeded: boolean;
}

// ... existing code ...

/**
 * List available Cromite/Chromium profiles with basic info
 */
export function listSourceProfiles(): Array<{ name: string; path: string; lastModified: Date; alias?: string }> {
    const profiles: Array<{ name: string; path: string; lastModified: Date; alias?: string }> = [];

    // Reverse lookup for aliases
    const aliasMap: Record<string, string> = {};
    for (const [alias, target] of Object.entries(PROFILE_ALIASES)) {
        // We only care about user-friendly aliases (not 'profile 1' mapping to 'Profile 1')
        if (alias.toLowerCase() !== target.toLowerCase()) {
            // target might be 'Profile 1', we map 'Profile 1' -> 'work'
            if (!aliasMap[target]) aliasMap[target] = alias;
            else aliasMap[target] += `, ${alias}`;
        }
    }

    // Check Chromium profiles
    const chromiumBase = join(homedir(), '.config/chromium');
    if (existsSync(chromiumBase)) {
        const entries = readdirSync(chromiumBase, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && (entry.name === 'Default' || entry.name.startsWith('Profile '))) {
                const profilePath = join(chromiumBase, entry.name);
                const cookiesPath = join(profilePath, 'Cookies');
                if (existsSync(cookiesPath)) {
                    const stats = statSync(cookiesPath);
                    profiles.push({
                        name: `chromium/${entry.name}`,
                        path: profilePath,
                        lastModified: stats.mtime,
                        alias: aliasMap[entry.name]
                    });
                }
            }
        }
    }

    // Check Cromite profiles (if different location)
    const cromiteBase = join(homedir(), '.config/cromite');
    if (existsSync(cromiteBase) && cromiteBase !== chromiumBase) {
        const entries = readdirSync(cromiteBase, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && (entry.name === 'Default' || entry.name.startsWith('Profile '))) {
                const profilePath = join(cromiteBase, entry.name);
                const cookiesPath = join(profilePath, 'Cookies');
                if (existsSync(cookiesPath)) {
                    const stats = statSync(cookiesPath);
                    profiles.push({
                        name: `cromite/${entry.name}`,
                        path: profilePath,
                        lastModified: stats.mtime,
                        alias: aliasMap[entry.name]
                    });
                }
            }
        }
    }

    // Check Google Chrome profiles
    const googleChromeBase = join(homedir(), '.config/google-chrome');
    if (existsSync(googleChromeBase)) {
        const entries = readdirSync(googleChromeBase, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && (entry.name === 'Default' || entry.name.startsWith('Profile '))) {
                const profilePath = join(googleChromeBase, entry.name);
                const cookiesPath = join(profilePath, 'Cookies');
                if (existsSync(cookiesPath)) {
                    const stats = statSync(cookiesPath);
                    profiles.push({
                        name: `google-chrome/${entry.name}`,
                        path: profilePath,
                        lastModified: stats.mtime,
                        alias: aliasMap[entry.name]
                    });
                }
            }
        }
    }

    return profiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/**
 * Copy a single file, creating parent directories if needed
 */
function copyFile(src: string, dest: string): boolean {
    try {
        const destDir = join(dest, '..');
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
        }
        copyFileSync(src, dest);
        return true;
    } catch (e: any) {
        console.error(`Failed to copy ${src}: ${e.message}`);
        return false;
    }
}

/**
 * Copy a directory recursively
 */
function copyDir(src: string, dest: string): boolean {
    try {
        // Use cp -r for simplicity and to handle symlinks correctly
        execSync(`cp -r "${src}" "${dest}"`, { stdio: 'pipe' });
        return true;
    } catch (e: any) {
        console.error(`Failed to copy directory ${src}: ${e.message}`);
        return false;
    }
}

/**
 * Sync profile to local target
 */
function syncToLocal(sourcePath: string, target: SyncTarget): SyncResult {
    const result: SyncResult = {
        success: false,
        filesTransferred: [],
        dirsTransferred: [],
        errors: [],
        targetRestartNeeded: true
    };

    const destPath = target.browserDataPath;

    // Create destination if it doesn't exist
    if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
    }

    // Copy auth files
    for (const file of AUTH_FILES) {
        const srcFile = join(sourcePath, file);
        const destFile = join(destPath, file);
        if (existsSync(srcFile)) {
            if (copyFile(srcFile, destFile)) {
                result.filesTransferred.push(file);
            } else {
                result.errors.push(`Failed to copy ${file}`);
            }
        }
    }

    // Copy auth directories
    for (const dir of AUTH_DIRS) {
        const srcDir = join(sourcePath, dir);
        const destDir = join(destPath, dir);
        if (existsSync(srcDir)) {
            // Remove existing dir first to avoid merge conflicts
            try {
                execSync(`rm -rf "${destDir}"`, { stdio: 'pipe' });
            } catch { /* ignore */ }
            if (copyDir(srcDir, destDir)) {
                result.dirsTransferred.push(dir);
            } else {
                result.errors.push(`Failed to copy ${dir}`);
            }
        }
    }

    result.success = result.filesTransferred.length > 0 || result.dirsTransferred.length > 0;
    return result;
}

/**
 * Sync profile to remote target via SSH
 */
function syncToRemote(sourcePath: string, target: SyncTarget): SyncResult {
    const result: SyncResult = {
        success: false,
        filesTransferred: [],
        dirsTransferred: [],
        errors: [],
        targetRestartNeeded: true
    };

    const sshHost = target.sshHost!;
    const destPath = target.browserDataPath;

    // Create destination directory on remote
    try {
        execSync(`ssh ${sshHost} "mkdir -p '${destPath}'"`, { stdio: 'pipe' });
    } catch (e: any) {
        result.errors.push(`Failed to create remote directory: ${e.message}`);
        return result;
    }

    // Copy auth files via rsync
    for (const file of AUTH_FILES) {
        const srcFile = join(sourcePath, file);
        if (existsSync(srcFile)) {
            try {
                execSync(`rsync -az "${srcFile}" ${sshHost}:"${destPath}/"`, { stdio: 'pipe' });
                result.filesTransferred.push(file);
            } catch (e: any) {
                result.errors.push(`Failed to sync ${file}: ${e.message}`);
            }
        }
    }

    // Copy auth directories via rsync
    for (const dir of AUTH_DIRS) {
        const srcDir = join(sourcePath, dir);
        if (existsSync(srcDir)) {
            try {
                // --delete ensures we replace, not merge
                execSync(`rsync -az --delete "${srcDir}/" ${sshHost}:"${destPath}/${dir}/"`, { stdio: 'pipe' });
                result.dirsTransferred.push(dir);
            } catch (e: any) {
                result.errors.push(`Failed to sync ${dir}: ${e.message}`);
            }
        }
    }

    result.success = result.filesTransferred.length > 0 || result.dirsTransferred.length > 0;
    return result;
}

/**
 * Main sync function
 */
// Profile aliases
const PROFILE_ALIASES: Record<string, string> = {
    'default': 'Default',
    'defalt': 'Default', // handle common typo
    'work': 'Profile 1',
    'personal': 'Profile 2',
    'profile 1': 'Profile 1', // handle case insensitivity
    'profile 2': 'Profile 2',
    'profile 3': 'Profile 3',
};

/**
 * Resolve source path from name/alias
 */
export function resolveSourcePath(input: string): string | undefined {
    // 1. Check if direct path exists
    if (existsSync(input)) return input;

    // 2. Parse browser/profile format (e.g., 'google-chrome/Default', 'chromium/Profile 1')
    const browserPaths: Record<string, string> = {
        'chromium': join(homedir(), '.config/chromium'),
        'cromite': join(homedir(), '.config/cromite'),
        'google-chrome': join(homedir(), '.config/google-chrome')
    };

    // Check if input has browser prefix
    for (const [browserName, browserBase] of Object.entries(browserPaths)) {
        if (input.startsWith(`${browserName}/`)) {
            const profileName = input.substring(browserName.length + 1);
            const candidate = join(browserBase, profileName);
            if (existsSync(candidate)) return candidate;
            return undefined; // Explicit browser prefix but profile not found
        }
    }

    // 3. Check aliases
    const lower = input.toLowerCase();
    const aliasTarget = PROFILE_ALIASES[lower] || (input.startsWith('profile ') ? input : undefined);

    // Search for the target (alias or direct name) in all browser dirs
    const targetName = aliasTarget || input;

    for (const base of Object.values(browserPaths)) {
        if (existsSync(base)) {
            const candidate = join(base, targetName);
            if (existsSync(candidate)) return candidate;

            // Try explicit 'Default' if mapping didn't cover it
            if (targetName === 'default' || targetName === 'Default') {
                const def = join(base, 'Default');
                if (existsSync(def)) return def;
            }
        }
    }

    return undefined;
}

/**
 * Main sync function
 */
export function syncProfile(sourceInput: string, targetName: string): SyncResult {
    const target = SYNC_TARGETS[targetName];
    if (!target) {
        return {
            success: false,
            filesTransferred: [],
            dirsTransferred: [],
            errors: [`Unknown target: ${targetName}. Available: ${Object.keys(SYNC_TARGETS).join(', ')}`],
            targetRestartNeeded: false
        };
    }

    const sourcePath = resolveSourcePath(sourceInput);

    if (!sourcePath || !existsSync(sourcePath)) {
        return {
            success: false,
            filesTransferred: [],
            dirsTransferred: [],
            errors: [`Source path does not exist or alias not found: ${sourceInput}`],
            targetRestartNeeded: false
        };
    }

    console.log(`\n🔄 Syncing auth from ${sourcePath} to ${target.name}...`);

    if (target.type === 'local') {
        return syncToLocal(sourcePath, target);
    } else {
        return syncToRemote(sourcePath, target);
    }
}

/**
 * Restart target browser to pick up new auth
 */
export function restartTarget(targetName: string): boolean {
    const target = SYNC_TARGETS[targetName];
    if (!target || !target.restartCommand) {
        return false;
    }

    console.log(`\n🔄 Restarting ${target.name}...`);

    try {
        if (target.type === 'local') {
            execSync(target.restartCommand, { stdio: 'inherit' });
        } else {
            execSync(`ssh ${target.sshHost} "${target.restartCommand}"`, { stdio: 'inherit' });
        }
        return true;
    } catch (e: any) {
        console.error(`Failed to restart: ${e.message}`);
        return false;
    }
}
