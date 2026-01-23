import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { z } from 'zod';

const configSchema = z.object({
  url: z.string().url().default('https://www.perplexity.ai'),
  headless: z.boolean().default(false),
  port: z.coerce.number().int().positive().default(3001),
  browserWsEndpoint: z.string().optional(),
  browserCdpEndpoint: z.string().optional(),
  remoteDebuggingPort: z.coerce.number().int().positive().optional(),
  selectors: z.object({
    loginButton: z.string().default('button:has-text("Log in")'),
    googleLoginButton: z.string().default('button:has-text("Continue with Google")'),
    queryInput: z.array(z.string()).default(['textarea[placeholder*="Ask"]', 'textarea', 'input[placeholder*="Ask"]', 'div[contenteditable="true"]']),
    submitButton: z.string().default('button[aria-label="Submit"]'),
    answerContainer: z.string().default('.prose'),
    followUpInput: z.string().default('textarea[placeholder*="Ask follow-up"]'),
  }).default({}),
  auth: z.object({
    userDataDir: z.string().default(path.join(os.homedir(), '.config', 'rsrch', 'user-data')),
    authFile: z.string().default(path.join(os.homedir(), '.config', 'rsrch', 'auth.json')),
  }),
  notifications: z.object({
    discordWebhookUrl: z.string().url().optional(),
    ntfy: z.object({
      topic: z.string().default('rsrch-audio'),
      server: z.string().url().default('https://ntfy.sh'),
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

// Load local config if exists
const configPath = path.join(process.cwd(), 'config.json');
let localConfig: any = {};
if (fs.existsSync(configPath)) {
  try {
    localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.warn('Failed to parse config.json', e);
  }
}

// Merge configurations
const mergedConfig = {
  ...localConfig,
  port: process.env.PORT || localConfig.port,
  browserWsEndpoint: process.env.BROWSER_WS_ENDPOINT || localConfig.browserWsEndpoint,
  browserCdpEndpoint: process.env.BROWSER_CDP_ENDPOINT || localConfig.browserCdpEndpoint,
  remoteDebuggingPort: process.env.REMOTE_DEBUGGING_PORT || localConfig.remoteDebuggingPort,
  auth: {
    userDataDir: process.env.PERPLEXITY_USER_DATA_DIR || localConfig.auth?.userDataDir,
    authFile: process.env.AUTH_FILE || localConfig.auth?.authFile,
  },
  notifications: {
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || localConfig.notifications?.discordWebhookUrl,
    ntfy: {
      topic: process.env.NTFY_TOPIC || localConfig.notifications?.ntfy?.topic,
      server: process.env.NTFY_SERVER || localConfig.notifications?.ntfy?.server,
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

export const config = configSchema.parse(mergedConfig);
