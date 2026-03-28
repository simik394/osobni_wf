const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
    console.log('Connecting to halvarm:9223...');
    const browser = await chromium.connectOverCDP('http://halvarm:9223');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('notebooklm.google.com')) || context.pages()[0];
    
    console.log(`Analyzing page: ${page.url()}`);
    
    // Get a brief summary of elements
    const bodyHtml = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t);
        const cards = Array.from(document.querySelectorAll('.mat-card, [role="button"]')).map(c => c.innerText.trim()).filter(t => t);
        return {
            title: document.title,
            buttons: buttons.slice(0, 20),
            cards: cards.slice(0, 20),
            html: document.body.innerHTML.substring(0, 5000)
        };
    });
    
    console.log('Page Title:', bodyHtml.title);
    console.log('Found Buttons:', bodyHtml.buttons);
    console.log('Found Cards/Buttons:', bodyHtml.cards);
    
    fs.writeFileSync('page_structure.json', JSON.stringify(bodyHtml, null, 2));
    await browser.close();
}

main().catch(console.error);
