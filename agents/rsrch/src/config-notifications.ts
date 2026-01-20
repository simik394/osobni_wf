import { z } from 'zod';

export const notificationConfigSchema = z.object({
    discordWebhookUrl: z.string().url().optional(),
    ntfy: z.object({
        topic: z.string().default('rsrch-audio'),
        server: z.string().url().default('https://ntfy.sh'),
    }).optional(),
});
