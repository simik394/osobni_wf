/**
 * Wraps content with Quarto (QMD) frontmatter if requested.
 */
export function formatContent(
    content: string, 
    title: string, 
    format: 'md' | 'qmd' = 'md',
    metadata: Record<string, any> = {}
): string {
    if (format === 'md') {
        return content;
    }

    // Generate QMD frontmatter
    let qmd = `---\n`;
    qmd += `title: "${title.replace(/"/g, '\\"')}"\n`;
    qmd += `date: "${new Date().toISOString()}"\n`;
    
    Object.entries(metadata).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            qmd += `${key}:\n${value.map(v => `  - "${v}"`).join('\n')}\n`;
        } else {
            qmd += `${key}: "${String(value).replace(/"/g, '\\"')}"\n`;
        }
    });
    
    qmd += `format: html\n`;
    qmd += `---\n\n`;
    qmd += content;
    
    return qmd;
}
