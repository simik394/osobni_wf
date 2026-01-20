import axios from 'axios';
import { config } from '../config';

interface DiscordField {
    name: string;
    value: string;
    inline?: boolean;
}

interface DiscordEmbed {
    title: string;
    description?: string;
    url?: string;
    color?: number; // Integer color
    fields?: DiscordField[];
    timestamp?: string;
    footer?: {
        text: string;
        icon_url?: string;
    };
}

export class DiscordService {
    private webhookUrl: string | undefined;

    constructor() {
        this.webhookUrl = config.notifications?.discordWebhookUrl;
    }

    private getStatusColor(success: boolean): number {
        return success ? 0x00FF00 : 0xFF0000; // Green or Red
    }

    async sendWebhook(embed: DiscordEmbed): Promise<void> {
        if (!this.webhookUrl) {
            console.warn('[Discord] No webhook URL configured, skipping notification.');
            return;
        }

        try {
            await axios.post(this.webhookUrl, {
                embeds: [embed]
            });
            console.log('[Discord] Notification sent.');
        } catch (error: any) {
            console.error('[Discord] Failed to send notification:', error.message);
        }
    }

    async notifyJobCompletion(jobId: string, type: string, query: string, success: boolean, details?: string, resultUrl?: string) {
        const embed: DiscordEmbed = {
            title: `${type} ${success ? 'Completed' : 'Failed'}`,
            description: success ? 'Job completed successfully.' : 'Job failed.',
            color: this.getStatusColor(success),
            fields: [
                { name: 'Job ID', value: jobId, inline: true },
                { name: 'Query', value: query.substring(0, 100) + (query.length > 100 ? '...' : '') },
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Perplexity Researcher Agent'
            }
        };

        if (details) {
            embed.fields?.push({ name: success ? 'Result' : 'Error', value: details.substring(0, 1024) });
        }

        if (resultUrl) {
            embed.url = resultUrl;
        }

        // Add execution time if available? (Passed in details maybe)

        await this.sendWebhook(embed);
    }
}

export const discordService = new DiscordService();
