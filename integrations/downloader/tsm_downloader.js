const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length < 1) {
    console.error("Usage: node tsm_downloader.js <path_to_tsv_json>");
    process.exit(1);
}

const jsonPath = path.resolve(args[0]);
let jsonBasename = path.basename(jsonPath, '.json').replace(/[^a-zA-Z0-9_-]/g, '_');
if (jsonBasename.length > 100) {
    jsonBasename = jsonBasename.substring(0, 100);
}
const targetDirName = `TSM_Export_${jsonBasename}`;

let data;
try {
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (e) {
    console.error("Failed to parse JSON file:", e.message);
    process.exit(1);
}

// 1. Extract and SORT tabs
const tabs = [];
const session = data[0];
if (!session || !session.windows) {
    console.error("Invalid Tab Session Manager JSON format.");
    process.exit(1);
}

Object.values(session.windows).forEach(windowObj => {
    Object.values(windowObj).forEach(tab => {
        if (!tab.url || !tab.url.startsWith('http')) return;
        tabs.push(tab);
    });
});

// Sort by windowId then by index to match browser order
tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
});

const DOWNLOADER_SCRIPT = path.join(__dirname, 'smart_download.sh');

// 2. Prepare queue with index prefix
console.log("\n--- Executing Ordered Downloads ---");
if (tabs.length === 0) {
    console.log("No URLs found.");
    process.exit(0);
}

console.log(`\nQueueing ${tabs.length} items for directory: ${targetDirName}`);

// We format each line as "001|URL"
const queueLines = tabs.map((tab, i) => {
    const prefix = (i + 1).toString().padStart(3, '0');
    return `${prefix}|${tab.url}`;
});

const tmpFile = `/tmp/tsm_queue_${Date.now()}.txt`;
fs.writeFileSync(tmpFile, queueLines.join('\n') + '\n');

try {
    console.log(`Executing smart_download.sh for ${targetDirName}...`);
    // Added -f (flat) and -p (preserve order/prefix mode)
    // Note: I will update smart_download.sh to support this prefix format
    execSync(`bash "${DOWNLOADER_SCRIPT}" -f -i "${tmpFile}" "${targetDirName}"`, { stdio: 'inherit' });
} catch (e) {
    console.error(`Error downloading for ${targetDirName}: ${e.message}`);
} finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
}

console.log(`\n=== TSM JSON Import Complete ===`);
console.log(`Total new downloads scheduled: ${tabs.length}`);
