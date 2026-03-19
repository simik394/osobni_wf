const fs = require('fs');
const path = require('path');

function sanitizePath(name) {
    if (!name) return 'unnamed';
    return name.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
}

function ensureDirSync(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function notifyUser(message) {
    console.log("\n🔔 [NOTIFY]: " + message);
    const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
    if (webhookUrl) {
        try {
            const { execSync } = require('child_process');
            // Optimised for ntfy.sh but works for generic webhooks
            execSync(`curl -s -H "Title: PWF Auth Required" -d "${message}" "${webhookUrl}" > /dev/null 2>&1`);
        } catch (e) {
            console.error("Failed to send notification:", e.message);
        }
    } else {
        console.log("   (Set NOTIFY_WEBHOOK_URL environment variable to receive push notifications)\n");
    }
}

module.exports = { sanitizePath, ensureDirSync, sleep, notifyUser };
