import { test, expect } from 'vitest';
import { chromium } from 'playwright';

test('Gemini Canvas HTML-to-Markdown DOM Parser Verification', async () => {
    // Launch a quick headless browser for absolute proof of concept
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Setup complex HTML structure resembling Gemini Canvas panel output
    const mockHtml = `
        <div id="canvas-root">
            <h1>Main Title</h1>
            <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text and a <a href="https://example.com">link</a>.</p>
            
            <h2>Section 1: Nested Lists</h2>
            <ul>
                <li>First item</li>
                <li>Second item with sub-list
                    <ul>
                        <li>Nested item 1</li>
                        <li>Nested item 2</li>
                    </ul>
                </li>
                <li>Third item</li>
            </ul>

            <h2>Section 2: Code Blocks</h2>
            <pre><code class="language-typescript">const test = "hello";\nconsole.log(test);</code></pre>
            <p>Some inline code like <code>const x = 5;</code> here.</p>

            <h2>Section 3: Structured Table</h2>
            <table>
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Status</th>
                        <th>Impact</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>DOM Parser</td>
                        <td>Active</td>
                        <td>High</td>
                    </tr>
                    <tr>
                        <td>Stdin Pipe</td>
                        <td>Implemented</td>
                        <td>Medium</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    await page.setContent(mockHtml);

    // Run the exact evaluate-based DOM-to-MD parser we implemented
    const markdown = await page.$eval('#canvas-root', (root) => {
        function traverse(node: any, context: { indent?: number; listType?: 'ul' | 'ol'; listIndex?: number } = {}): string {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.nodeValue || '';
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const tagName = node.tagName.toUpperCase();
            
            // Handle code blocks specially to avoid parsing their children recursively
            if (tagName === 'PRE' || tagName === 'CODE') {
                if (tagName === 'PRE') {
                    const codeNode = node.querySelector('code') || node;
                    const langClass = Array.from(codeNode.classList).find((c: any) => c.startsWith('language-') || c.startsWith('lang-'));
                    const lang = langClass ? (langClass as string).replace(/^(language-|lang-)/, '') : '';
                    return `\n\`\`\`${lang}\n${codeNode.textContent?.trim() || ''}\n\`\`\`\n`;
                }
                if (node.closest('pre')) {
                    return node.textContent || '';
                }
                return `\`${node.textContent || ''}\``;
            }

            let childrenContent = '';
            const isList = tagName === 'UL' || tagName === 'OL';
            const newIndent = (context.indent || 0) + (isList ? 1 : 0);
            
            let childIndex = 0;
            for (const child of Array.from(node.childNodes)) {
                childrenContent += traverse(child as HTMLElement, { 
                    ...context, 
                    indent: newIndent,
                    listType: tagName === 'UL' ? 'ul' : tagName === 'OL' ? 'ol' : context.listType,
                    listIndex: tagName === 'OL' ? ++childIndex : undefined
                });
            }

            switch (tagName) {
                case 'H1': return `\n# ${childrenContent.trim()}\n\n`;
                case 'H2': return `\n## ${childrenContent.trim()}\n\n`;
                case 'H3': return `\n### ${childrenContent.trim()}\n\n`;
                case 'H4': return `\n#### ${childrenContent.trim()}\n\n`;
                case 'H5': return `\n##### ${childrenContent.trim()}\n\n`;
                case 'H6': return `\n###### ${childrenContent.trim()}\n\n`;
                case 'P': return `\n${childrenContent.trim()}\n\n`;
                case 'BR': return '\n';
                case 'HR': return '\n---\n';
                
                case 'STRONG':
                case 'B':
                    return childrenContent.trim() ? `**${childrenContent.trim()}**` : '';
                case 'EM':
                case 'I':
                    return childrenContent.trim() ? `*${childrenContent.trim()}*` : '';
                case 'A': {
                    const href = node.getAttribute('href');
                    if (href && !href.startsWith('javascript:')) {
                        return `[${childrenContent.trim() || href}](${href})`;
                    }
                    return childrenContent;
                }
                
                case 'UL':
                case 'OL':
                    return context.indent && context.indent > 1 ? childrenContent : `\n${childrenContent}\n`;
                    
                case 'LI': {
                    const indentStr = '  '.repeat(Math.max(0, (context.indent || 1) - 1));
                    const bullet = context.listType === 'ol' ? `${context.listIndex || 1}. ` : '- ';
                    return `${indentStr}${bullet}${childrenContent.trim()}\n`;
                }
                
                case 'TABLE':
                    return `\n${childrenContent}\n`;
                case 'TR':
                    return `| ${childrenContent.trim()} |\n`;
                case 'TD':
                case 'TH':
                    return childrenContent.trim();
                    
                default:
                    return childrenContent;
            }
        }

        function parseTable(tableNode: HTMLTableElement): string {
            const rows = Array.from(tableNode.querySelectorAll('tr'));
            if (rows.length === 0) return '';
            
            let markdown = '\n';
            let colCount = 0;
            
            rows.forEach((row, rowIndex) => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                if (rowIndex === 0) {
                    colCount = cells.length;
                    markdown += '| ' + cells.map(c => traverse(c).trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n';
                    markdown += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
                } else {
                    markdown += '| ' + cells.map(c => traverse(c).trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n';
                }
            });
            
            return markdown + '\n';
        }

        const tables = Array.from(root.querySelectorAll('table'));
        const tableReplacements: Array<{ placeholder: string; md: string }> = [];
        
        tables.forEach((table, index) => {
            const placeholder = `<!-- TABLE_PLACEHOLDER_${index} -->`;
            const md = parseTable(table as HTMLTableElement);
            tableReplacements.push({ placeholder, md });
            
            const marker = document.createTextNode(placeholder);
            table.parentNode?.replaceChild(marker, table);
        });

        let result = traverse(root);
        
        tableReplacements.forEach(({ placeholder, md }) => {
            result = result.replace(placeholder, md);
        });
        
        return result
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    });

    console.log("=========================================");
    console.log("Parsed Output Markdown:");
    console.log("=========================================");
    console.log(markdown);
    console.log("=========================================");

    // Verify Title
    expect(markdown).toContain('# Main Title');

    // Verify Paragraph & Links
    expect(markdown).toContain('This is a paragraph with **bold** and *italic* text and a [link](https://example.com).');

    // Verify Nested Lists
    expect(markdown).toContain('- First item');
    expect(markdown).toContain('  - Nested item 1');
    expect(markdown).toContain('  - Nested item 2');

    // Verify Code Blocks
    expect(markdown).toContain('\n```typescript\nconst test = "hello";\nconsole.log(test);\n```');
    expect(markdown).toContain('inline code like `const x = 5;` here');

    // Verify Table parsing
    expect(markdown).toContain('| Feature | Status | Impact |');
    expect(markdown).toContain('| --- | --- | --- |');
    expect(markdown).toContain('| DOM Parser | Active | High |');
    expect(markdown).toContain('| Stdin Pipe | Implemented | Medium |');

    await browser.close();
});
