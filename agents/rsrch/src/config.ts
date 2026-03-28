import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { z } from 'zod';
import { DEFAULTS } from '@agents/shared';

const configSchema = z.object({
  url: z.string().url().default('https://www.perplexity.ai'),
  headless: z.coerce.boolean().default(false),
  host: z.string().default(DEFAULTS.RSRCH.HOST),
  port: z.coerce.number().int().positive().default(DEFAULTS.RSRCH.API_PORT),
  vncPort: z.coerce.number().int().positive().default(DEFAULTS.RSRCH.VNC_PORT),
  chromiumPort: z.coerce.number().int().positive().default(DEFAULTS.RSRCH.CHROMIUM_PORT),
  browserWsEndpoint: z.string().optional(),
  browserCdpEndpoint: z.string().optional(),
  remoteDebuggingPort: z.coerce.number().int().positive().optional(),
  auth: z.object({
    userDataDir: z.string().default(path.join(os.homedir(), '.config', 'rsrch', 'user-data')),
    authFile: z.string().default(path.join(os.homedir(), '.config', 'rsrch', 'auth.json')),
  }),
  notifications: z.object({
    discordWebhookUrl: z.string().url().optional(),
    ntfy: z.object({
      topic: z.string().default('rsrch-audio'),
      server: z.string().url().default('https://ntfy.sh'),
      token: z.string().optional(),
    }).optional(),
  }),
  paths: z.object({
    resultsDir: z.string().default(path.join(os.homedir(), '.local', 'share', 'rsrch', 'results')),
    queriesFile: z.string().default(path.join(process.cwd(), 'data', 'queries.json')),
  }),
  falkor: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().int().positive().default(6379),
  }),
  windmill: z.object({
    apiUrl: z.string().url().optional(),
    token: z.string().optional(),
    workspace: z.string().optional(),
    audioScriptPath: z.string().optional(),
  }).optional(),
});

/**
 * Load and merge configuration from:
 * 1. Hardcoded Defaults (via Zod)
 * 2. Local config.json (if exists)
 * 3. Environment Variables (Priority)
 */
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');
  let localConfig: any = {};
  if (fs.existsSync(configPath)) {
    try {
      localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse config.json', e);
    }
  }

  const envPort = process.env.PORT || process.env.NOMAD_PORT_http;
  const resolvedPort = envPort ? parseInt(envPort, 10) : (localConfig.port || DEFAULTS.RSRCH.API_PORT);

  const merged = {
    ...localConfig,
    host: process.env.RSRCH_HOST || localConfig.host,
    port: resolvedPort,
    vncPort: process.env.RSRCH_VNC_PORT ? parseInt(process.env.RSRCH_VNC_PORT) : localConfig.vncPort,
    chromiumPort: process.env.RSRCH_CHROMIUM_PORT ? parseInt(process.env.RSRCH_CHROMIUM_PORT) : localConfig.chromiumPort,
    browserWsEndpoint: process.env.BROWSER_WS_ENDPOINT || localConfig.browserWsEndpoint,
    browserCdpEndpoint: process.env.BROWSER_CDP_ENDPOINT || localConfig.browserCdpEndpoint,
    remoteDebuggingPort: process.env.REMOTE_DEBUGGING_PORT || localConfig.remoteDebuggingPort,
    auth: {
      userDataDir: process.env.PERPLEXITY_USER_DATA_DIR || localConfig.auth?.userDataDir,
      authFile: process.env.AUTH_FILE || localConfig.auth?.authFile,
    },
    notifications: {
      discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK || localConfig.notifications?.discordWebhookUrl,
      ntfy: {
        topic: process.env.NTFY_TOPIC || localConfig.notifications?.ntfy?.topic,
        server: process.env.NTFY_SERVER || localConfig.notifications?.ntfy?.server,
        token: process.env.NTFY_TOKEN || localConfig.notifications?.ntfy?.token,
      }
    },
    paths: {
      resultsDir: process.env.RESULTS_DIR || localConfig.paths?.resultsDir,
      queriesFile: process.env.QUERIES_FILE || localConfig.paths?.queriesFile,
    },
    falkor: {
      host: process.env.FALKORDB_HOST || localConfig.falkor?.host,
      port: process.env.FALKORDB_PORT || localConfig.falkor?.port,
    },
    windmill: {
      apiUrl: process.env.WINDMILL_API_URL || localConfig.windmill?.apiUrl,
      token: process.env.WINDMILL_TOKEN || localConfig.windmill?.token,
      workspace: process.env.WINDMILL_WORKSPACE || localConfig.windmill?.workspace,
      audioScriptPath: process.env.WINDMILL_AUDIO_SCRIPT_PATH || localConfig.windmill?.audioScriptPath,
    }
  };

  return configSchema.parse(merged);
}

export const config = loadConfig();
export default config;
