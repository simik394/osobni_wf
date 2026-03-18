const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('moodle_course_dump.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

function extractModules() {
    const results = [];
    const sections = document.querySelectorAll('div.courseindex-section');
    sections.forEach(sec => {
        const titleNode = sec.querySelector('a[data-for="section_title"]');
        let sectionName = titleNode ? titleNode.textContent.trim() : 'Unknown Section';
        
        const links = sec.querySelectorAll('a[data-for="cm_name"]');
        links.forEach(link => {
            const url = link.href;
            const name = link.textContent.trim();
            let type = 'unknown';
            if (url.includes('mod/resource')) type = 'resource';
            else if (url.includes('mod/folder')) type = 'folder';
            else if (url.includes('mod/assign')) type = 'assignment';
            else if (url.includes('mod/page')) type = 'page';
            else if (url.includes('mod/forum')) type = 'forum';
            else if (url.includes('mod/url')) type = 'url';

            results.push({ section: sectionName, name, type, url });
        });
    });
    return results;
}

console.log(extractModules());
