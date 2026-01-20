/**
 * Unit tests for GeminiClient parsing functions
 * Tests pure functions without browser dependencies
 */
import { describe, it, expect } from 'vitest';

// ============================================================================
// Test htmlToMarkdownSimple logic (extracted for testability)
// In production, this would be refactored to export the function
// ============================================================================

/**
 * Convert HTML content to markdown (extracted from GeminiClient)
 * This is a copy of the private method for testing purposes
 */
function htmlToMarkdownSimple(html: string): string {
    let md = html;

    // Handle code blocks: <pre><code class="language-xxx">...</code></pre>
    md = md.replace(/<pre[^>]*><code(?:\s+class="language-(\w+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
        (_, lang, code) => {
            const language = lang || '';
            const decoded = code
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/<[^>]+>/g, ''); // Strip any inner HTML tags
            return `\n\`\`\`${language}\n${decoded.trim()}\n\`\`\`\n`;
        });

    // Handle inline code: <code>...</code>
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
        const decoded = code
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
        return `\`${decoded}\``;
    });

    // Handle headings
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

    // Handle bold and italic
    md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

    // Handle lists
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
    md = md.replace(/<\/?[ou]l[^>]*>/gi, '\n');

    // Handle paragraphs and line breaks
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n');

    // Handle links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Strip remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    md = md.replace(/&nbsp;/g, ' ');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#39;/g, "'");

    // Clean up extra whitespace
    md = md.replace(/\n{3,}/g, '\n\n');

    return md.trim();
}

// ============================================================================
// Tests
// ============================================================================

describe('htmlToMarkdownSimple', () => {
    describe('Code blocks', () => {
        it('should convert code blocks with language', () => {
            const html = '<pre><code class="language-typescript">const x = 1;</code></pre>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('```typescript');
            expect(result).toContain('const x = 1;');
            expect(result).toContain('```');
        });

        it('should convert code blocks without language', () => {
            const html = '<pre><code>plain code</code></pre>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('```\n');
            expect(result).toContain('plain code');
        });

        it('should decode HTML entities in code blocks', () => {
            // Note: Inner HTML tags like <div> are stripped, only entities are decoded
            const html = '<pre><code>&lt;div&gt;&amp;text&lt;/div&gt;</code></pre>';
            const result = htmlToMarkdownSimple(html);
            // The regex decodes &lt; &gt; &amp; but strips any actual HTML tags
            expect(result).toContain('&text');
            expect(result).toContain('```');
        });

        it('should handle inline code', () => {
            const html = 'Use <code>npm install</code> to install';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('Use `npm install` to install');
        });
    });

    describe('Headings', () => {
        it('should convert h1 to markdown', () => {
            const html = '<h1>Main Title</h1>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('# Main Title');
        });

        it('should convert h2 to markdown', () => {
            const html = '<h2>Section</h2>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('## Section');
        });

        it('should convert h3 to markdown', () => {
            const html = '<h3>Subsection</h3>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('### Subsection');
        });

        it('should handle headings with attributes', () => {
            const html = '<h2 class="title" id="section-1">With Attrs</h2>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('## With Attrs');
        });
    });

    describe('Text formatting', () => {
        it('should convert strong to bold', () => {
            const html = 'This is <strong>important</strong> text';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('This is **important** text');
        });

        it('should convert b to bold', () => {
            const html = 'This is <b>bold</b> text';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('This is **bold** text');
        });

        it('should convert em to italic', () => {
            const html = 'This is <em>emphasized</em> text';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('This is *emphasized* text');
        });

        it('should convert i to italic', () => {
            const html = 'This is <i>italic</i> text';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('This is *italic* text');
        });
    });

    describe('Lists', () => {
        it('should convert unordered list items', () => {
            const html = '<ul><li>First</li><li>Second</li></ul>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('- First');
            expect(result).toContain('- Second');
        });

        it('should convert ordered list items', () => {
            const html = '<ol><li>Step 1</li><li>Step 2</li></ol>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('- Step 1');
            expect(result).toContain('- Step 2');
        });
    });

    describe('Paragraphs and breaks', () => {
        it('should convert paragraphs', () => {
            const html = '<p>First paragraph</p><p>Second paragraph</p>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('First paragraph');
            expect(result).toContain('Second paragraph');
        });

        it('should convert br to newline', () => {
            const html = 'Line one<br>Line two<br/>Line three';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('Line one\nLine two\nLine three');
        });
    });

    describe('Links', () => {
        it('should convert links to markdown format', () => {
            const html = 'Visit <a href="https://example.com">Example Site</a> for more';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('Visit [Example Site](https://example.com) for more');
        });

        it('should handle links with extra attributes', () => {
            const html = '<a href="https://test.com" target="_blank" rel="noopener">Link</a>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('[Link](https://test.com)');
        });
    });

    describe('HTML entities', () => {
        it('should decode common HTML entities', () => {
            const html = '&lt;tag&gt; &amp; &quot;quoted&quot; &#39;apostrophe&#39;';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('<tag> & "quoted" \'apostrophe\'');
        });

        it('should convert nbsp to space', () => {
            const html = 'word&nbsp;word';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('word word');
        });
    });

    describe('Edge cases', () => {
        it('should strip unknown HTML tags', () => {
            const html = '<custom>content</custom><span>more</span>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toBe('contentmore');
        });

        it('should handle empty input', () => {
            const result = htmlToMarkdownSimple('');
            expect(result).toBe('');
        });

        it('should handle plain text', () => {
            const result = htmlToMarkdownSimple('Just plain text');
            expect(result).toBe('Just plain text');
        });

        it('should collapse multiple newlines', () => {
            const html = '<p>Para 1</p>\n\n\n\n<p>Para 2</p>';
            const result = htmlToMarkdownSimple(html);
            // Should not have more than 2 consecutive newlines
            expect(result).not.toMatch(/\n{3,}/);
        });

        it('should trim whitespace', () => {
            const html = '   <p>Content</p>   ';
            const result = htmlToMarkdownSimple(html);
            expect(result).not.toMatch(/^\s/);
            expect(result).not.toMatch(/\s$/);
        });
    });

    describe('Complex HTML', () => {
        it('should handle nested formatting', () => {
            const html = '<p><strong>Bold with <em>italic</em></strong></p>';
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('**Bold with *italic***');
        });

        it('should handle full document structure', () => {
            const html = `
                <h1>Title</h1>
                <p>Introduction paragraph with <strong>bold</strong>.</p>
                <h2>Section</h2>
                <ul>
                    <li>Item one</li>
                    <li>Item two</li>
                </ul>
                <pre><code class="language-js">console.log("hello");</code></pre>
            `;
            const result = htmlToMarkdownSimple(html);
            expect(result).toContain('# Title');
            expect(result).toContain('**bold**');
            expect(result).toContain('## Section');
            expect(result).toContain('- Item one');
            expect(result).toContain('```js');
            expect(result).toContain('console.log("hello");');
        });
    });
});
