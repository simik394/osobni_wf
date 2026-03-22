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
                    let detailsLink = '';
                    if (cells[7]) {
                        const dl = cells[7].querySelector('a');
                        if (dl && dl.href) detailsLink = dl.href;
                    }

                    if (title && link) {
                        dropboxes.push({
                            course: course,
                            title: title,
                            validFrom: validFrom,
                            validTo: validTo,
                            submitted: submittedCount,
                            link: link,
                            detailsLink: detailsLink
                        });
                    }
                }
            }
        }
        return dropboxes;
    }

    static extractDropboxDetails(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const details = {};
        const rows = document.querySelectorAll('table tr');
        
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length === 2) {
                let label = cells[0].textContent.trim().replace(/:$/, '');
                let value = cells[1].textContent.trim();
                if (label && value && label.length < 50) {
                    details[label] = value;
                }
            }
        }
        return details;
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
                    let name = a.textContent.trim();
                    const urlIdMatch = a.href.match(/predmet=(\d+)/);
                    if (name && urlIdMatch) {
                        // Pokud název v odkazu (např. z anomálií) neobsahuje kód předmětu, 
                        // zkusíme propátrat rodičovský element, kde kód typicky je
                        if (!/^[0-9A-Z]{4,8}/.test(name)) {
                            const parentText = a.parentElement ? a.parentElement.textContent : '';
                            const codeMatch = parentText.match(/\b([1-9][A-Z0-9]{4,6})\b/);
                            if (codeMatch) {
                                name = `${codeMatch[1]} ${name}`;
                            }
                        }

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

    static extractSyllabusDetails(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        
        const details = {};
        
        // InSIS stores syllabus details in a specific layout, often in pairs of elements
        // Easiest heuristic is looking for <b> tags containing labels, and their nextElementSibling for values
        // or just looking inside rows.
        const rows = document.querySelectorAll('tr');
        let currentHeader = '';
        
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length === 2) {
                const label = cells[0].textContent.trim().replace(/:$/, '');
                const value = cells[1].textContent.trim();
                
                if (label && value && label.length < 100) {
                    details[label] = value;
                }
            } else if (cells.length === 1) {
                const b = cells[0].querySelector('b');
                if (b) {
                    currentHeader = b.textContent.trim().replace(/:$/, '');
                } else if (currentHeader) {
                    details[currentHeader] = cells[0].textContent.trim();
                    currentHeader = '';
                }
            }
        }
        
        // Clean up common useless keys or limit the payload to important ones
        const importantKeys = [
            "Ident", "Identifikátor", "Identifikátor předmětu", "Kód", "Kód předmětu", "Subject",
            "Course title in English", "Course title in Czech", 
            "Aims of the course", "Learning outcomes and competences", 
            "Course contents", "Assessment methods and criteria",
            "Cíle předmětu", "Výsledky učení", "Osnova", "Název předmětu česky"
        ];
        
        const filteredDetails = {};
        for (const k of importantKeys) {
            if (details[k] || details[k+":"]) {
                filteredDetails[k] = details[k] || details[k+":"];
            }
        }
        
        // If filtered is completely empty because of different DOM, just dump all
        if (Object.keys(filteredDetails).length === 0) {
            return details;
        }

        return filteredDetails;
    }

    static extractAnomalies(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const tables = document.querySelectorAll('table');
        
        // Anomalies are listed as a small table below the timetable, usually the 3rd table
        let targetTable = null;
        for (const table of tables) {
            const text = table.textContent;
            if (text.includes('(1)') || text.includes('changes and transfers')) {
                // If it looks like the legend block
                if (Array.from(table.querySelectorAll('tr')).some(tr => /^\(\d+\)/.test(tr.textContent.trim()))) {
                    targetTable = table;
                    break;
                }
            }
        }

        const anomalies = [];
        if (targetTable) {
            const rows = targetTable.querySelectorAll('tr');
            for (const row of rows) {
                const text = row.textContent.trim().replace(/\s+/g, ' ');
                const match = text.match(/^\((\d+)\)\s*(.+)/);
                if (match) {
                    anomalies.push({
                        id: match[1],
                        description: match[2]
                    });
                }
            }
        }
        return anomalies;
    }

    static extractGrades(htmlContent) {
        const dom = new jsdom.JSDOM(htmlContent);
        const { document } = dom.window;
        const tables = document.querySelectorAll('table');
        const grades = [];

        // Easiest heuristic: look for tables that have headers with "point", "bod", "hodn"
        for (const table of tables) {
            const text = table.textContent.toLowerCase();
            if (text.includes('point') || text.includes('bod') || text.includes('hodn')) {
                // If it's the attendance table, skip
                if (text.includes('attendance') && !text.includes('point')) continue;

                // Attempt to parse rows
                const rows = Array.from(table.querySelectorAll('tr'));
                if (rows.length < 2) continue;

                // For a robust implementation, assume row 0 is headers
                const headers = Array.from(rows[0].querySelectorAll('th, td')).map(h => h.textContent.trim());
                
                for (let i = 1; i < rows.length; i++) {
                    const cells = Array.from(rows[i].querySelectorAll('td')).map(c => c.textContent.trim());
                    if (cells.length === headers.length && cells.length > 1) {
                        const entry = {};
                        headers.forEach((h, idx) => {
                            if (h) entry[h] = cells[idx];
                        });
                        if (Object.keys(entry).length > 0) {
                            grades.push(entry);
                        }
                    }
                }
            }
        }
        return grades;
    }

    // --- State Formatters (Domain -> Textual Representation) ---

    static formatGradesSummary(gradesJson) {
        if (!gradesJson || gradesJson.length === 0) return "Žádné nové průběžné hodnocení (Zero points recorded yet).";
        let summary = "### 📊 Aktualizace Průběžného Hodnocení\n";
        gradesJson.forEach((g, idx) => {
            summary += `- Záznam ${idx + 1}: ${JSON.stringify(g)}\n`;
        });
        return summary;
    }

    static formatAnomaliesSummary(anomaliesJson) {
        if (!anomaliesJson || anomaliesJson.length === 0) return "Žádné anomálie v rozvrhu.";
        let summary = "### ⚠️ Anomálie v Rozvrhu (Změny, Svátky, Odpadlice)\n";
        anomaliesJson.forEach(a => {
            summary += `- **(${a.id})**: ${a.description}\n`;
        });
        return summary;
    }

    static formatDropboxesSummary(dropboxesJson) {
        if (!dropboxesJson || dropboxesJson.length === 0) return "Žádné aktivní odevzdávárny.";
        let summary = "### 📥 Odevzdávárny\n";
        dropboxesJson.forEach((d) => {
            summary += `- **${d.course}** - ${d.title} (do ${d.validTo})\n`;
            if (d.details && Object.keys(d.details).length > 0) {
                summary += `  - *Detaily:* ${JSON.stringify(d.details)}\n`;
            }
        });
        return summary;
    }

    static formatExamsSummary(examsJson) {
        if (!examsJson || examsJson.length === 0) return "Žádné dostupné termíny zkoušek.";
        let summary = "### 📝 Termíny zkoušek\n";
        examsJson.forEach((e) => {
            summary += `- **${e.courseName}** (${e.category}): ${e.date} v ${e.room} (Kapacita: ${e.capacity})\n`;
        });
        return summary;
    }

    static formatSubjectsSummary(subjectsJson) {
        if (!subjectsJson || subjectsJson.length === 0) return "Žádné registrované předměty.";
        let summary = "### 📚 Seznam Předmětů a Profilů\n";
        subjectsJson.forEach((s) => {
            summary += `- **${s.name}**\n`;
            if (s.profile && Object.keys(s.profile).length > 0) {
                summary += `  - *Cíle:* ${s.profile['Aims of the course'] || s.profile['Cíle předmětu'] || 'N/A'}\n`;
            }
        });
        return summary;
    }
}

module.exports = InsisDataExtractor;
