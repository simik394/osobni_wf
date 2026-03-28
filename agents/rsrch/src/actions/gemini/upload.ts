import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Upload files to the current Gemini chat session.
 * 
 * @param ctx UniversalContext containing page and logger
 * @param deps Dependencies including selectors
 * @param filePaths Absolute paths to files to upload
 * @returns boolean indicating success
 */
export async function uploadFilesAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    filePaths: string[]
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        log(`Uploading ${filePaths.length} files...`);

        // 1. Open "+" menu
        const plusBtn = page.locator(selectors.gemini.upload.button).first();
        try {
            await plusBtn.waitFor({ state: 'visible', timeout: 3000 });
            await plusBtn.click();
        } catch (e) {
            log('Primary upload selector failed, trying fallback...', 'warn');
            const fallbackBtn = page.getByRole('button', { name: /nahrávání|Upload|Přidat|Attach|Add/i }).first();
            if (await fallbackBtn.isVisible()) {
                await fallbackBtn.click();
            } else {
                log('Upload (+) button not visible', 'error');
                return false;
            }
        }
        await page.waitForTimeout(1000);

        // 2. Handle file input
        const hiddenFileInput = page.locator('[data-test-id="hidden-local-file-upload-button"] input[type="file"], [data-test-id*="file-upload"] input[type="file"], input[type="file"]').first();
        const fileInput = page.locator(selectors.gemini.upload.fileInput).first();

        if (await hiddenFileInput.count() > 0) {
            log('Using hidden file input');
            await hiddenFileInput.setInputFiles(filePaths);
        } else if (await fileInput.count() > 0) {
            log('Using standard file input');
            await fileInput.setInputFiles(filePaths);
        } else {
            const uploadItem = page.locator(selectors.gemini.upload.uploadFile).first();
            if (await uploadItem.isVisible()) {
                const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
                await uploadItem.click();

                const fileChooser = await fileChooserPromise;
                if (fileChooser) {
                    await fileChooser.setFiles(filePaths);
                } else {
                    const lateInput = page.locator(selectors.gemini.upload.fileInput).first();
                    if (await lateInput.count() > 0) {
                        await lateInput.setInputFiles(filePaths);
                    } else {
                        log('File chooser or input not found', 'error');
                        return false;
                    }
                }
            } else {
                log('Upload menu item not visible', 'error');
                await page.keyboard.press('Escape');
                return false;
            }
        }

        log('Waiting for files to process...');
        await page.waitForTimeout(2000 * filePaths.length);

        return true;
    } catch (e: any) {
        log(`Upload failed: ${e.message}`, 'error');
        return false;
    }
}
