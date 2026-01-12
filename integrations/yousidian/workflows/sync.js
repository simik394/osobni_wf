/**
 * Yousidian Sync Logic
 * Intended for use in n8n Code Node.
 */

// Function: Clean Obsidian Markdown for YouTrack
// Removes [[WikiLinks]] and > [!callouts]
function cleanMarkdown(content) {
    if (!content) return "";

    let clean = content;

    // 1. Remove standard internal links: [[Link]] -> Link
    clean = clean.replace(/\[\[([^\]|]+)\]\]/g, '$1');

    // 2. Remove aliased internal links: [[Link|Alias]] -> Alias
    clean = clean.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');

    // 3. Remove Embeds: ![[Image.png]] -> [Image.png]
    clean = clean.replace(/!\[\[([^\]]+)\]\]/g, '[$1]');

    // 4. Simplify Callouts: > [!INFO] Text -> > Text
    clean = clean.replace(/> \[!.*?\]/g, '> ');

    // 5. Remove Frontmatter (YAML block at start)
    clean = clean.replace(/^---\n[\s\S]*?\n---\n/, '');

    return clean.trim();
}

// Function: Normalize Payload for internal Proxy
// Transforms YouTrack/Obsidian data into standard internal event
function normalizePayload(source, data) {
    if (source === 'youtrack') {
        return {
            event: 'update',
            origin: 'youtrack',
            id: data.id || data.idReadable,
            summary: data.summary,
            description: data.description,
            state: data.customFields ? data.customFields.find(f => f.name === 'State')?.value?.name : null,
            obsidian_uuid: data.customFields ? data.customFields.find(f => f.name === 'ObsidianUUID')?.value : null
        };
    } else if (source === 'obsidian') {
        return {
            event: 'update',
            origin: 'obsidian',
            // Obsidian Webhook payload structure varies by plugin
            id: data.frontmatter ? data.frontmatter.youtrack_id : null,
            uuid: data.frontmatter ? data.frontmatter.uuid : null,
            content: cleanMarkdown(data.content),
            frontmatter: data.frontmatter
        };
    }
}

// Example Usage (for n8n)
// const items = $input.all();
// return items.map(item => {
//   const json = item.json;
//   const cleaned = cleanMarkdown(json.content);
//   return { json: { ...json, cleanedContent: cleaned } };
// });

module.exports = { cleanMarkdown, normalizePayload };
