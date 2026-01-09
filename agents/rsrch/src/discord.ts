/**
 * Discord notification helper
 */
import { config } from './config';
import { sendNotification, loadConfigFromEnv } from './notify';
import logger from './logger';

// Load ntfy/discord config from env on module load
loadConfigFromEnv();

export async function sendDiscordNotification(message: string, embed?: {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
}) {
    const webhookUrl = config.notifications.discordWebhookUrl;
    if (!webhookUrl) {
        logger.info('[Discord] No webhook URL configured, skipping notification');
        return;
    }

    try {
        const payload: any = {};

        if (embed) {
            payload.embeds = [{
                title: embed.title,
                description: embed.description,
                color: embed.color || 0x5865F2, // Discord blurple
                fields: embed.fields,
                timestamp: new Date().toISOString()
            }];
        } else {
            payload.content = message;
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            logger.error(`[Discord] Webhook failed: ${response.status} ${await response.text()}`);
        } else {
            logger.info('[Discord] Notification sent');
        }
    } catch (e: any) {
        logger.error('[Discord] Failed to send notification:', e.message);
    }
}

export function notifyJobCompleted(jobId: string, type: string, query: string, success: boolean, resultSummary?: string) {
    const color = success ? 0x00FF00 : 0xFF0000; // Green or Red
    const status = success ? '✅ Completed' : '❌ Failed';
    const priority = success ? 'default' : 'high';

    // Send to Discord (rich embed)
    sendDiscordNotification('', {
        title: `Job ${status}`,
        description: `**Type:** ${type}\n**Query:** ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`,
        color,
        fields: [
            { name: 'Job ID', value: jobId, inline: true },
            ...(resultSummary ? [{ name: 'Result', value: resultSummary.substring(0, 200), inline: false }] : [])
        ]
    });

    // Send to ntfy.sh (simple message)
    const ntfyMessage = `${status} ${type}: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`;
    sendNotification(ntfyMessage, {
        title: `rsrch: ${type}`,
        priority: priority as any
    }).catch(e => logger.error('[Notify] Failed:', e.message));
}

