import axios from 'axios';

/**
 * Send a notification to Discord via Webhook
 */
import { config } from './config';
import logger from './logger';

export async function notifyJobCompleted(
    jobId: string,
    type: string,
    query: string,
    success: boolean,
    resultOrError?: string
): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        logger.info('[Discord] No webhook URL configured, skipping notification');
        return;
    }

    // Color: Green (Success) / Red (Failure)
    const color = success ? 0x00FF00 : 0xFF0000;

    // Truncate result if too long
    let description = resultOrError || (success ? 'Task completed successfully.' : 'Task failed.');
    if (description.length > 2000) {
        description = description.substring(0, 1997) + '...';
    }

    const payload = {
        embeds: [{
            title: `Job ${success ? 'Completed' : 'Failed'}: ${type}`,
            color: color,
            fields: [
                {
                    name: "Job ID",
                    value: `\`${jobId}\``,
                    inline: true
                },
                {
                    name: "Query",
                    value: query || "N/A",
                    inline: true
                }
            ],
            description: description,
            timestamp: new Date().toISOString(),
            footer: {
                text: "RSRCH Agent"
            }
        }]
    };

    try {
        await axios.post(webhookUrl, payload);
        logger.info(`[Discord] Notification sent for job ${jobId}`);
    } catch (error: any) {
        logger.error(`[Discord] Failed to send notification: ${error.message}`);
    }
}
