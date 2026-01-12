const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log("Navigating to Memgraph download page...");
    await page.goto('https://memgraph.com/download');
    
    // Wait for the Memgraph Lab section/tab to appear
    // Note: Selectors might need adjustment based on actual page structure
    // We'll look for text "Memgraph Lab" and then try to find the Linux download
    
    console.log("Waiting for content...");
    await page.waitForTimeout(5000); // Wait for dynamic content

    // Evaluate page content to find the link
    const href = await page.evaluate(() => {
        // Try to find any link containing 'memgraph-lab' and '.deb'
        const links = Array.from(document.querySelectorAll('a'));
        const debLink = links.find(a => 
            (a.href.includes('memgraph-lab') || a.href.includes('MemgraphLab')) && 
            a.href.includes('.deb') &&
            a.href.includes('linux')
        );
        return debLink ? debLink.href : null;
    });

    if (href) {
        console.log("FOUND_URL: " + href);
    } else {
        console.log("URL not found with simple search. Dumping all .deb links:");
        const allDebs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(h => h.endsWith('.deb'));
        });
        console.log(allDebs.join('\n'));
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
})();
