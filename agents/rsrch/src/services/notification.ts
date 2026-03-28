import axios from 'axios';
import { config } from '../config';

export interface DiscordField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface DiscordEmbed {
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

export interface NotificationOptions {
    title?: string;
    priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
    tags?: string[];
    url?: string;
    urlTitle?: string;
}

/**
 * Unified Notification Service
 * Supports Discord webhooks and ntfy.sh topics.
 */
export class NotificationService {
    private discordUrl: string | undefined;
    private ntfyConfig: { server: string; topic: string; token?: string } | undefined;

    constructor() {
        this.discordUrl = config.notifications?.discordWebhookUrl;
        if (config.notifications?.ntfy) {
            this.ntfyConfig = {
                server: config.notifications.ntfy.server,
                topic: config.notifications.ntfy.topic,
                token: config.notifications.ntfy.token
            };
        }
    }

    private getStatusColor(successOrPriority?: boolean | string): number {
        if (typeof successOrPriority === 'boolean') {
            return successOrPriority ? 0x00FF00 : 0xFF0000;
        }
        switch (successOrPriority) {
            case 'urgent': return 0xFF0000; // Red
            case 'high': return 0xFFA500;   // Orange
            default: return 0x00FF00;      // Green
        }
    }

    /**
     * Send notification to all configured channels.
     */
    async sendNotification(message: string, options: NotificationOptions = {}): Promise<void> {
        console.log(`[Notification] Sending: ${options.title || 'Notification'} - ${message}`);
        
        const tasks: Promise<any>[] = [];
        
        if (this.discordUrl) {
            tasks.push(this.sendDiscord(message, options));
        }
        
        if (this.ntfyConfig) {
            tasks.push(this.sendNtfy(message, options));
        }

        if (tasks.length === 0) {
            console.warn('[Notification] No channels configured (Discord/Ntfy), skipping.');
            return;
        }

        await Promise.allSettled(tasks);
    }

    /**
     * Specialized helper for job completion (ported from legacy discord.ts)
     */
    async notifyJobCompletion(jobId: string, type: string, query: string, success: boolean, details?: string, resultUrl?: string): Promise<void> {
        const title = `${type} ${success ? 'Completed' : 'Failed'}`;
        const message = details || (success ? 'Job completed successfully.' : 'Job failed.');
        
        await this.sendNotification(message, {
            title,
            priority: success ? 'default' : 'high',
            url: resultUrl,
            tags: [type.toLowerCase(), success ? 'success' : 'failure']
        });

        // For Discord specifically, we add fields
        if (this.discordUrl) {
            const embed: DiscordEmbed = {
                title,
                description: message.substring(0, 2048),
                color: this.getStatusColor(success),
                fields: [
                    { name: 'Job ID', value: jobId, inline: true },
                    { name: 'Query', value: query.substring(0, 100) },
                ],
                timestamp: new Date().toISOString()
            };
            if (resultUrl) embed.url = resultUrl;
            
            await this.sendWebhook(embed);
        }
    }

    /**
     * Send to Discord
     */
    private async sendDiscord(message: string, options: NotificationOptions): Promise<void> {
        try {
            const embed: DiscordEmbed = {
                title: options.title || 'Notification',
                description: message,
                color: this.getStatusColor(options.priority),
                timestamp: new Date().toISOString(),
                footer: { text: 'Rsrch Agent' }
            };

            if (options.url) embed.url = options.url;
            
            await axios.post(this.discordUrl!, { embeds: [embed] });
        } catch (error: any) {
            console.error('[Discord] Failed to send notification:', error.message);
        }
    }

    /**
     * Send to ntfy.sh
     */
    private async sendNtfy(message: string, options: NotificationOptions): Promise<void> {
        try {
            const { server, topic, token } = this.ntfyConfig!;
            const url = `${server}/${topic}`;

            const headers: Record<string, string> = {
                'Title': options.title || 'Notification',
                'Priority': this.getNtfyPriority(options.priority),
            };

            if (options.tags?.length) headers['Tags'] = options.tags.join(',');
            if (options.url) headers['Click'] = options.url;
            if (token) headers['Authorization'] = `Bearer ${token}`;

            await axios.post(url, message, { headers });
        } catch (error: any) {
            console.error('[Ntfy] Failed to send notification:', error.message);
        }
    }

    private getNtfyPriority(p?: string): string {
        switch (p) {
            case 'urgent': return '5';
            case 'high': return '4';
            case 'low': return '2';
            case 'min': return '1';
            default: return '3';
        }
    }

    /**
     * Raw embed helper for WebhookRouter
     */
    async sendWebhook(embed: DiscordEmbed): Promise<void> {
        if (!this.discordUrl) return;
        try {
            await axios.post(this.discordUrl, { embeds: [embed] });
        } catch (error: any) {
            console.error('[Discord] Action failed:', error.message);
        }
    }
}

export const discordService = new NotificationService();
export default discordService;
