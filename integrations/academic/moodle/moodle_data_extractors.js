const jsdom = require('jsdom');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

// Shared turndown instance, configured once
const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
});
turndown.use(gfm);

// Keep images with alt text
turndown.addRule('moodleImages', {
    filter: 'img',
    replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        if (!src) return '';
        return `![${alt}](${src})`;
    }
});

class MoodleDataExtractor {
    static extractModules(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const results = [];
        const sections = document.querySelectorAll('div.courseindex-section');
        
        sections.forEach((sec, index) => {
            const titleEl = sec.querySelector('.courseindex-section-title a[data-for="section_title"]');
            let sectionTitle = titleEl ? titleEl.textContent.trim() : `Section ${index + 1}`;
            sectionTitle = sectionTitle.replace(/^\d+\.\s*/, '').trim(); 
            
            const moduleNodes = sec.querySelectorAll('li.courseindex-item');
            for (const modElement of moduleNodes) {
                const linkLabel = modElement.querySelector('a.courseindex-link');
                if (!linkLabel) continue;
                
                const href = linkLabel.href;
                if (!href) continue;
                
                const cleanHref = href.split('#')[0];
                if (cleanHref.includes('javascript:')) continue;
                
                const title = linkLabel.textContent.trim();

                let type = 'unknown';
                if (href.includes('mod/resource')) type = 'resource';
                else if (href.includes('mod/folder')) type = 'folder';
                else if (href.includes('mod/page')) type = 'page';
                else if (href.includes('mod/assign')) type = 'assign';
                else if (href.includes('mod/turnitintooltwo')) type = 'turnitintooltwo';
                else if (href.includes('mod/choicegroup')) type = 'choicegroup';
                else if (href.includes('mod/feedback')) type = 'feedback';
                else if (href.includes('mod/quiz')) type = 'quiz';
                else if (href.includes('mod/book')) type = 'book';
                else type = 'other';
                
                results.push({
                    section: sectionTitle,
                    name: title,
                    type: type,
                    url: href
                });
            }
        });
        return results;
    }

    static extractResourceLink(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const resLink = document.querySelector('.resourceworkaround a');
        if (resLink) return resLink.href;
        const obj = document.querySelector('object[data]');
        if (obj) return obj.getAttribute('data');
        return null;
    }

    static extractBookPrintLink(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const links = Array.from(document.querySelectorAll('a'));
        const target = links.find(a => a.textContent.includes('Vytisknout celou knihu') || a.textContent.includes('Print complete book'));
        if (target) return target.href;
        
        const printLinks = links.filter(a => a.href && a.href.includes('tool/print/index.php'));
        if (printLinks.length > 0) {
            const wholeBook = printLinks.find(a => !a.href.includes('chapterid'));
            return wholeBook ? wholeBook.href : printLinks[0].href;
        }
        return null;
    }

    static extractMainContent(htmlContent, title) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const mainRegion = document.querySelector('[role="main"]') || document.querySelector('#region-main') || document.body;
        return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${title}</title>\n<style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:900px;margin:auto;} img{max-width:100%;height:auto;}</style>\n</head>\n<body>\n<h1>${title}</h1>\n<hr>\n${mainRegion.innerHTML}\n</body>\n</html>`;
    }

    /**
     * Extract the main content as Markdown.
     * Strips Moodle UI chrome, converts to clean MD with turndown.
     * @param {string} htmlContent - full page HTML
     * @param {string} title - module title
     * @param {string} [sourceUrl] - original Moodle URL
     * @returns {string} Markdown string
     */
    static extractMainContentAsMarkdown(htmlContent, title, sourceUrl) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const mainRegion = document.querySelector('[role="main"]') || document.querySelector('#region-main') || document.body;

        // Remove Moodle chrome that pollutes the content
        const removeSelectors = [
            'nav', 'script', 'style', 'noscript',
            '.block', '.breadcrumb', '.activity-navigation',
            '.completion-info', '.modified', '.lastmodified',
            '#page-footer', '.footer', '.navbar',
            'form[data-region="grading-actions"]',
            '.submissionstatustable',
            '.action-menu', '.dropdown',
            'button', 'input[type="submit"]',
            '.singlebutton',
            '.activity-header .badge',
            '[data-region="activity-dates"]',
        ];
        for (const sel of removeSelectors) {
            mainRegion.querySelectorAll(sel).forEach(el => el.remove());
        }

        const innerHtml = mainRegion.innerHTML;
        let md = turndown.turndown(innerHtml);

        // Clean up excessive blank lines
        md = md.replace(/\n{3,}/g, '\n\n').trim();

        // Build frontmatter-style header
        let header = `# ${title}\n\n`;
        if (sourceUrl) header += `> Zdroj: ${sourceUrl}\n\n`;
        header += `---\n\n`;

        return header + md + '\n';
    }

    static extractAttachments(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const atts = [];
        document.querySelectorAll('a[href*="pluginfile.php"]').forEach(a => {
            if (!a.href.includes('user/icon')) {
                const text = (a.innerText || a.textContent || '').trim();
                atts.push({ url: a.href, text: text });
            }
        });
        return atts;
    }
}

module.exports = MoodleDataExtractor;
