import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://100.73.45.27:9223');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('notebooklm.google.com')) || await context.newPage();
  
  if (!page.url().includes('notebooklm.google.com')) {
    await page.goto('https://notebooklm.google.com/');
  }
  
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/home/sim/Obsi/Prods/01-pwf/agents/rsrch/data/notebooklm_remote_home.png', fullPage: true });
  
  // Try to find the "More options" (three dots) menu for a notebook
  const notebookMenuItems = await page.$$('div[role="listitem"] button[aria-label*="More options"]');
  console.log(`Found ${notebookMenuItems.length} notebook menu buttons.`);
  
  if (notebookMenuItems.length > 0) {
    await notebookMenuItems[0].click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/sim/Obsi/Prods/01-pwf/agents/rsrch/data/notebooklm_remote_menu.png' });
  }

  await browser.close();
}

main().catch(console.error);
