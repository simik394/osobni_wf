const jsdom = require('jsdom');
const fs = require('fs');

class InsisDataExtractor {
    static extractExams(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const exams = [];

        // InSIS splits exams into 3 tables usually:
        // table_1 -> Registered exams
        // table_2 -> Available to register
        // table_3 -> Unsuitable / Cannot register
        const tables = [
            { id: 'table_1', category: 'registered' },
            { id: 'table_2', category: 'available' },
            { id: 'table_3', category: 'unsuitable' }
        ];

        for (const t of tables) {
            const tableElement = document.getElementById(t.id);
            if (!tableElement) continue;

            const rows = tableElement.querySelectorAll('tbody tr.uis-hl-table');
            for (const row of rows) {
                const cells = row.querySelectorAll('td.odsazena');
                // Number of cells varies, but usually:
                // idx 0 -> Ord.
                // idx 1 -> Status Icon
                // idx 2 -> Code (e.g. 4IT414)
                // idx 3 -> Course Name (contains <a> link to syllabus)
                // idx 4 -> Study period (hidden)
                // idx 5 -> Date of exam sitting
                // idx 6 -> Where
                // idx 7 -> Type (form)
                // idx 8 -> Put up by
                // idx 9 -> Registered capacity

                if (cells.length >= 10) {
                    const code = cells[2]?.textContent?.trim() || '';
                    const courseName = cells[3]?.textContent?.trim() || '';
                    const date = cells[5]?.textContent?.trim() || '';
                    const room = cells[6]?.textContent?.trim() || '';
                    const type = cells[7]?.textContent?.trim() || '';
                    const teacher = cells[8]?.textContent?.trim() || '';
                    const capacity = cells[9]?.textContent?.trim() || '';
                    
                    if (code && courseName) {
                        exams.push({
                            category: t.category,
                            code,
                            courseName,
                            date,
                            room,
                            type,
                            teacher,
                            capacity
                        });
                    }
                }
            }
        }
        return exams;
    }

    static extractDropboxes(htmlContent) {
        // Dropboxes usually list subjects and then a table of dropboxes for each subject
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const dropboxes = [];

        // Odevzdávárny logic: InSIS uses generic tables, let's look for tables with specific headers
        // Headers: Title, Description, Valid from, Valid to, Submissions, etc.
        const tables = document.querySelectorAll('table');
        
        let currentSubject = "";
        
        // Find main table or subject headers (often in previous rows or preceding h elements)
        // Actually, InSIS "Coursework submissions" usually has 1 large table or multiple tables per term.
        // Let's grab all rows that might be a dropbox item
        const rows = document.querySelectorAll('tr.uis-hl-table');
        for (const row of rows) {
            const cells = row.querySelectorAll('td.odsazena');
            // Assuming structure: Nazev odevzdavarny, Termin od-do, Max souboru, Odevzdano
            if (cells.length >= 4) {
                // In InSIS dropboxes table:
                // cells[0]: Course (e.g. 4IZ451 ...)
                // cells[1]: Dropbox Title
                // cells[4]: Valid from
                // cells[5]: Valid to
                // cells[8]: Submitted count
                // cells[11]: Link to open dropbox (e.g. odevzdavarny_odevzdani.pl)

                if (cells.length >= 12) {
                    const title = cells[1].textContent.trim();
                    const course = cells[0].textContent.trim();
                    const validFrom = cells[4].textContent.trim();
                    const validTo = cells[5].textContent.trim();
                    const submittedCount = cells[8].textContent.trim();
                    const linkAnchor = cells[11].querySelector('a');
                    let link = '';
                    if (linkAnchor && linkAnchor.href) {
                        link = linkAnchor.href;
                    }

                    if (title && link) {
                        dropboxes.push({
                            course: course,
                            title: title,
                            validFrom: validFrom,
                            validTo: validTo,
                            submitted: submittedCount,
                            link: link
                        });
                    }
                }
            }
        }
        return dropboxes;
    }

    static extractSyllabuses(htmlRozvrh, htmlPortal) {
        // Combine all subject codes from Schedule and Portal
        const dom1 = new jsdom.JSDOM(htmlRozvrh || '<html/>');
        const dom2 = new jsdom.JSDOM(htmlPortal || '<html/>');
        
        const subjects = new Map();
        
        const scanLinks = (doc) => {
            const links = doc.querySelectorAll('a');
            for (const a of links) {
                if (a.href && a.href.includes('syllabus.pl?predmet=')) {
                    // Extract subject name
                    const name = a.textContent.trim();
                    const urlIdMatch = a.href.match(/predmet=(\d+)/);
                    if (name && urlIdMatch) {
                        subjects.set(urlIdMatch[1], {
                            id: urlIdMatch[1],
                            name: name,
                            link: a.href
                        });
                    }
                }
            }
        };

        scanLinks(dom1.window.document);
        scanLinks(dom2.window.document);

        return Array.from(subjects.values());
    }

    static extractDocuments(htmlContent) {
        // Placeholder for "Nové dokumenty" / "Dokumentový server"
        // The user specifically requested this. We will integrate this later by parsing
        // /auth/dok_server/nove_dok.pl or similar document storage dumps.
        return [];
    }
}

module.exports = InsisDataExtractor;
