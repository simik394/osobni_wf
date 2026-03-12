const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length < 1) {
    console.error("Usage: node tsm_downloader.js <path_to_tsv_json>");
    process.exit(1);
}

const jsonPath = path.resolve(args[0]);
let data;
try {
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (e) {
    console.error("Failed to parse JSON file:", e.message);
    process.exit(1);
}

// 1. Extract URLs and group them
const groups = {}; // groupId -> [urls]
const flatUrls = []; // urls without specific group

function getDomain(urlStr) {
    try {
        return new URL(urlStr).hostname.replace(/^www\./, '');
    } catch {
        return "unknown";
    }
}

// TSM JSON structure: [{ windows: { windowId: { tabId: { url: "...", groupId: 123 } } } }]
const session = data[0];
if (!session || !session.windows) {
    console.error("Invalid Tab Session Manager JSON format.");
    process.exit(1);
}

Object.values(session.windows).forEach(windowObj => {
    Object.values(windowObj).forEach(tab => {
        if (!tab.url) return;
        // filtering out non-web urls (like chrome://)
        if (!tab.url.startsWith('http')) return;

        if (tab.groupId !== undefined && tab.groupId !== -1) {
            if (!groups[tab.groupId]) groups[tab.groupId] = [];
            groups[tab.groupId].push(tab.url);
        } else {
            flatUrls.push(tab.url);
        }
    });
});

const DOWNLOADS_DIR = path.join(require('os').homedir(), 'Downloads');
const GLOBAL_META = path.join(DOWNLOADS_DIR, 'download_metadata.txt');
const DOWNLOADER_SCRIPT = path.join(__dirname, 'smart_download.sh');

// 2. Helper to load global metadata
let globalMetaLines = [];
if (fs.existsSync(GLOBAL_META)) {
    globalMetaLines = fs.readFileSync(GLOBAL_META, 'utf8').split('\n').filter(Boolean);
}

// metaDict maps sourceUrl -> { fullLine, localPath }
const metaDict = {};
globalMetaLines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 2) {
        metaDict[parts[0]] = {
            fullLine: line,
            localPath: parts[1]
        };
    }
});

function updateGlobalMeta(sourceUrl, newLocalPath) {
    // Replace the specific line in memory and rewrite the file
    const newTimestamp = new Date().toISOString();
    const newLine = `${sourceUrl}\t${newLocalPath}\t${newTimestamp}`;

    // Find and update in memory lines
    for (let i = 0; i < globalMetaLines.length; i++) {
        if (globalMetaLines[i].startsWith(sourceUrl + '\t')) {
            globalMetaLines[i] = newLine;
            break;
        }
    }
    fs.writeFileSync(GLOBAL_META, globalMetaLines.join('\n') + '\n');
    metaDict[sourceUrl] = { fullLine: newLine, localPath: newLocalPath };
}

// 3. Process each group
// Determine group names based on majority domain or first domain
const finalQueue = {}; // folderName -> [urls_to_download]

Object.entries(groups).forEach(([groupId, urls]) => {
    if (urls.length === 0) return;
    const firstDomain = getDomain(urls[0]);
    const dirName = `Group_${groupId}_${firstDomain.split('.')[0]}`;
    const targetDir = path.join(DOWNLOADS_DIR, dirName);

    urls.forEach(url => {
        const meta = metaDict[url];
        if (meta) {
            // Already downloaded globally. Check if it's sitting in a flat hierarchy where it shouldn't be.
            const currentObjPath = meta.localPath;
            if (fs.existsSync(currentObjPath) && path.dirname(currentObjPath) !== targetDir) {
                console.log(`[Migration] Moving ${path.basename(currentObjPath)} to ${dirName}...`);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                const newPath = path.join(targetDir, path.basename(currentObjPath));
                try {
                    fs.renameSync(currentObjPath, newPath);
                    // Update global meta
                    updateGlobalMeta(url, newPath);
                    // Update/Create local meta
                    const localMetaPath = path.join(targetDir, 'download_metadata.txt');
                    fs.appendFileSync(localMetaPath, `${url}\t${newPath}\t${new Date().toISOString()}\n`);
                } catch (e) {
                    console.error(`Error migrating ${currentObjPath}: ${e.message}`);
                }
            } else if (!fs.existsSync(currentObjPath)) {
                // Metadata says it exists but file is gone. Queue for redownload.
                if (!finalQueue[dirName]) finalQueue[dirName] = [];
                finalQueue[dirName].push(url);
            }
        } else {
            // Not in metadata at all. Queue for download.
            if (!finalQueue[dirName]) finalQueue[dirName] = [];
            finalQueue[dirName].push(url);
        }
    });
});

// Process flat URLs (group by base domain)
flatUrls.forEach(url => {
    const domain = getDomain(url);
    const dirName = `Mixed_${domain.split('.')[0]}`;
    const targetDir = path.join(DOWNLOADS_DIR, dirName);

    const meta = metaDict[url];
    if (meta) {
        const currentObjPath = meta.localPath;
        if (fs.existsSync(currentObjPath) && path.dirname(currentObjPath) !== targetDir) {
            console.log(`[Migration] Moving flat tab ${path.basename(currentObjPath)} to ${dirName}...`);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            const newPath = path.join(targetDir, path.basename(currentObjPath));
            try {
                fs.renameSync(currentObjPath, newPath);
                updateGlobalMeta(url, newPath);
                const localMetaPath = path.join(targetDir, 'download_metadata.txt');
                fs.appendFileSync(localMetaPath, `${url}\t${newPath}\t${new Date().toISOString()}\n`);
            } catch (e) {
                console.error(`Error migrating ${currentObjPath}: ${e.message}`);
            }
        } else if (!fs.existsSync(currentObjPath)) {
            if (!finalQueue[dirName]) finalQueue[dirName] = [];
            finalQueue[dirName].push(url);
        }
    } else {
        if (!finalQueue[dirName]) finalQueue[dirName] = [];
        finalQueue[dirName].push(url);
    }
});


// 4. Trigger downloads for un-downloaded items
console.log("\n--- Executing Downloads ---");
let totalDownloadsScheduled = 0;
Object.entries(finalQueue).forEach(([dirName, urls]) => {
    if (urls.length === 0) return;

    console.log(`\nQueueing ${urls.length} items for directory: ${dirName}`);
    totalDownloadsScheduled += urls.length;

    const tmpFile = `/tmp/tsm_queue_${Date.now()}_${Math.floor(Math.random() * 1000)}.txt`;
    fs.writeFileSync(tmpFile, urls.join('\n') + '\n');

    try {
        console.log(`Executing smart_download.sh for ${dirName}...`);
        execSync(`bash "${DOWNLOADER_SCRIPT}" -i "${tmpFile}" "${dirName}"`, { stdio: 'inherit' });
    } catch (e) {
        console.error(`Error downloading for ${dirName}: ${e.message}`);
    } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
});

console.log(`\n=== TSM JSON Import Complete ===`);
console.log(`Total new downloads scheduled: ${totalDownloadsScheduled}`);
