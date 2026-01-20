// Windmill Script: publish_single_jules_session  
// Publishes a single Jules session - simpler interface for targeted publishing
//
// Usage: Pass a single session ID
// Deployed as Windmill webhook for easy curl access

interface PublishSingleRequest {
    session_id: string;
    mode?: 'pr' | 'branch';
}

interface PublishSingleResult {
    success: boolean;
    session_id: string;
    pr_url?: string;
    error?: string;
}

export async function main(args: PublishSingleRequest): Promise<PublishSingleResult> {
    // Import the batch publisher and run with single session
    const { main: batchPublish } = await import("./publish_jules_sessions.ts");

    const result = await batchPublish({
        session_ids: [args.session_id],
        mode: args.mode || 'pr'
    });

    if (result.results.length > 0) {
        const r = result.results[0];
        return {
            success: r.success,
            session_id: r.session_id,
            pr_url: r.pr_url,
            error: r.error
        };
    }

    return {
        success: false,
        session_id: args.session_id,
        error: 'No result returned'
    };
}
