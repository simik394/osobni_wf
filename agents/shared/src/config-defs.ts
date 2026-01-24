/**
 * Shared Configuration Defaults
 * This file serves as the Single Source of Truth for legacy hardcoded values.
 * 
 * Usage:
 * import { DEFAULTS } from '@agents/shared';
 * const host = process.env.RSRCH_HOST || DEFAULTS.RSRCH.HOST;
 */

export const DEFAULTS = {
    RSRCH: {
        HOST: 'halvarm',
        API_PORT: 3055,
        VNC_PORT: 5955,
        CHROMIUM_PORT: 5902,
        CDP_PORT: 9223,
        PROFILES_PATH: '/opt/rsrch/profiles'
    },
    WINDMILL: {
        HOST: 'halvarm',
        PORT: 9223 // used in windmill client fallback
    }
} as const;
