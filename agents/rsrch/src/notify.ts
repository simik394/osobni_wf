/**
 * Notification Service
 * 
 * Supports multiple backends:
 * - ntfy.sh (self-hosted or public)
 * - Discord webhooks
 * 
 * Usage:
 *   await sendNotification('Research complete!', { title: 'AI Trends' });
 */

export interface NotificationOptions {
    title?: string;
    priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
    tags?: string[];
    url?: string;
    urlTitle?: string;
}

export interface NotificationConfig {
    ntfy?: {
        server: string;  // 'https://ntfy.sh' or self-hosted
        topic: string;   // e.g., 'my-research'
        token?: string;  // Optional auth token
    };
    discord?: {
        webhookUrl: string;
    };
}

// Local config for notify module
let notifyConfig: NotificationConfig = {};

/**
 * Initialize notification service with config.
 */
export function configureNotifications(cfg: NotificationConfig): void {
    notifyConfig = cfg;
    console.log('📬 Notification service configured');
    if (cfg.ntfy) console.log(`   ntfy: ${cfg.ntfy.server}/${cfg.ntfy.topic}`);
    if (cfg.discord) console.log('   Discord: webhook configured');
}

/**
 * Load config from environment variables.
 */
export function loadConfigFromEnv(): void {
    const ntfyServer = process.env.NTFY_SERVER || 'https://ntfy.sh';
    const ntfyTopic = process.env.NTFY_TOPIC;
    const ntfyToken = process.env.NTFY_TOKEN;
    const discordWebhook = process.env.DISCORD_WEBHOOK;

    if (ntfyTopic) {
        notifyConfig.ntfy = { server: ntfyServer, topic: ntfyTopic, token: ntfyToken };
    }
    if (discordWebhook) {
        notifyConfig.discord = { webhookUrl: discordWebhook };
    }
}

/**
 * Send notification to all configured backends.
 */
export async function sendNotification(
    message: string,
    options: NotificationOptions = {}
): Promise<{ ntfy?: boolean; discord?: boolean }> {
    const results: { ntfy?: boolean; discord?: boolean } = {};

    if (notifyConfig.ntfy) {
        results.ntfy = await sendNtfy(message, options);
    }
    if (notifyConfig.discord) {
        results.discord = await sendDiscord(message, options);
    }

    if (!notifyConfig.ntfy && !notifyConfig.discord) {
        console.warn('⚠️ No notification channels configured');
    }

    return results;
}

/**
 * Send to ntfy.sh
 */
async function sendNtfy(
    message: string,
    options: NotificationOptions
): Promise<boolean> {
    try {
        const { server, topic, token } = notifyConfig.ntfy!;
        const url = `${server}/${topic}`;

        const headers: Record<string, string> = {};
        if (options.title) headers['Title'] = options.title;
        if (options.priority) headers['Priority'] = options.priority;
        if (options.tags?.length) headers['Tags'] = options.tags.join(',');
        if (options.url) headers['Click'] = options.url;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(url, {
            method: 'POST',
            body: message,
            headers
        });

        if (response.ok) {
            console.log('✅ ntfy notification sent');
            return true;
        } else {
            console.error(`❌ ntfy failed: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('❌ ntfy error:', error);
        return false;
    }
}

/**
 * Send to Discord webhook
 */
async function sendDiscord(
    message: string,
    options: NotificationOptions
): Promise<boolean> {
    try {
        const { webhookUrl } = notifyConfig.discord!;

        // Build Discord embed
        const embed: Record<string, any> = {
            description: message,
            color: options.priority === 'urgent' ? 0xff0000 :
                options.priority === 'high' ? 0xff9900 :
                    0x00ff00,
            timestamp: new Date().toISOString()
        };

        if (options.title) embed.title = options.title;
        if (options.url) embed.url = options.url;

        const payload = {
            embeds: [embed]
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok || response.status === 204) {
            console.log('✅ Discord notification sent');
            return true;
        } else {
            console.error(`❌ Discord failed: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('❌ Discord error:', error);
        return false;
    }
}

/**
 * Quick notification helper with research defaults.
 */
export async function notifyResearchComplete(
    topic: string,
    audioPath?: string
): Promise<void> {
    const message = audioPath
        ? `Audio ready: ${audioPath}`
        : 'Research complete';

    await sendNotification(message, {
        title: `📚 ${topic}`,
        priority: 'default',
        tags: ['research', 'audio'],
        url: audioPath
    });
}
