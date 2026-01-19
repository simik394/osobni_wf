/**
 * NotebookLM Selector Configuration
 * 
 * Loads selector configuration from selectors.yaml for easier maintenance.
 * When NotebookLM UI changes, update selectors.yaml instead of client code.
 * 
 * @module selectors
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// Type definitions for selector categories
export interface HomeSelectors {
    createNewButton: string;
    projectButton: string;
    projectButtonTitle: string;
    projectCard: string;
    primaryActionButton: string;
}

export interface NotebookSelectors {
    titleInput: string;
    urlPattern: string;
}

export interface SourcesSelectors {
    tab: string;
    tabTextPattern: string;
    addSourcesButton: string;
    dropZoneButton: string;
    webSourcePattern: string;
    pasteTextPattern: string;
    drivePattern: string;
    urlInputTextarea: string;
    submitButton: string;
    dialogContainer: string;
    selectAllInputEn: string;
    selectAllInputCs: string;
    drivePickerFrame: string;
    driveSearchInput: string;
    driveFileRow: string;
    driveSelectButton: string;
}

export interface StudioSelectors {
    maximizeButton: string;
    artifactButton: string;
    artifactLibraryItem: string;
    artifactTitle: string;
    audioIcon: string;
    audioIconPattern: string;
    moreMenuButton: string;
    moreMenuIcon: string;
    menuItem: string;
    renameOption: string;
    downloadOption: string;
    renameInput: string;
}

export interface AudioSelectors {
    customizeButtonEn: string;
    customizeButtonCs: string;
    customizeTextareaCs: string;
    customizeTextareaPlaceholder: string;
    generateButtonCs: string;
    generateButtonEn: string;
    audioOverviewButtonCs: string;
    audioOverviewButtonEn: string;
    audioOverviewButtonText: string;
    generatingIndicatorCs: string;
    generatingIndicatorEn: string;
}

export interface DownloadSelectors {
    moreButton: string;
    downloadMenuItemCs: string;
    downloadMenuItemEn: string;
    menuVisible: string;
}

export interface ChatSelectors {
    input: string;
    submitButton: string;
    messageContainer: string;
    lastMessage: string;
    thinkingIndicator: string;
}

export interface GeminiSelectors {
    auth: {
        acceptAll: string;
        dismiss: string;
        signIn: string;
        welcome: string;
    };
    model: {
        trigger: string;
        menu: string;
        item: string;
        advanced: string;
        flash: string;
        thinking: string;
        pro: string;
    };

    chat: {
        app: string;
        input: string;
        send: string;
        response: string;
        history: string;
        newChat: string;
        thoughtToggle?: string;
        thoughtContainer?: string;
    };
    sidebar: {
        menu: string;
        conversations: string;
        showMore: string;
        myStuff: string;
        gems: string;
    };
    deepResearch: {
        panel: string;
        documentCard: string;
        documentTitle: string;
        toolbarTitle: string;
        immersiveTitle: string;
    };
    gems: {
        card: string;
        name: string;
        create: string;
        nameInput: string;
        instructionInput: string;
        save: string;
    };
    upload: {
        button: string;
        fileInput: string;
        uploadFile: string;
        drive: string;
        photos: string;
        importCode: string;
        notebooklm: string;
    };
}

export interface NotebookLMSelectors {
    home: HomeSelectors;
    notebook: NotebookSelectors;
    sources: SourcesSelectors;
    studio: StudioSelectors;
    audio: AudioSelectors;
    download: DownloadSelectors;
    chat: ChatSelectors;
    gemini: GeminiSelectors;
}

// Default selectors (fallback if YAML fails to load)
const defaultSelectors: NotebookLMSelectors = {
    home: {
        createNewButton: '.create-new-button',
        projectButton: 'project-button',
        projectButtonTitle: '.project-button-title',
        projectCard: 'mat-card',
        primaryActionButton: '.primary-action-button',
    },
    notebook: {
        titleInput: 'input.title-input',
        urlPattern: '**/notebook/**',
    },
    sources: {
        tab: 'div[role="tab"]',
        tabTextPattern: 'Zdroje|Sources',
        addSourcesButton: 'Přidat zdroje|Add sources',
        dropZoneButton: 'button.drop-zone-icon-button',
        webSourcePattern: 'web|link|site',
        pasteTextPattern: 'Pasted text|Vložený text|Copied text|Zkopírovaný text|Text',
        drivePattern: 'Disk|Drive',
        urlInputTextarea: 'mat-dialog-container textarea',
        submitButton: 'mat-dialog-container button.mat-primary',
        dialogContainer: 'mat-dialog-container',
        selectAllInputEn: 'input[aria-label="Select all sources"]',
        selectAllInputCs: 'input[aria-label="Vybrat všechny zdroje"]',
        drivePickerFrame: 'iframe',
        driveSearchInput: 'input[type="text"]',
        driveFileRow: 'div[role="option"], div[role="row"]',
        driveSelectButton: 'Vybrat|Select',
    },
    studio: {
        maximizeButton: 'button[aria-label="Maximalizovat"]',
        artifactButton: 'button.artifact-button-content',
        artifactLibraryItem: 'artifact-library-item',
        artifactTitle: '.artifact-title',
        audioIcon: 'audio_magic_eraser',
        audioIconPattern: 'audio',
        moreMenuButton: 'button[aria-label*="More"], button[aria-label*="Další"]',
        moreMenuIcon: 'button mat-icon:has-text("more_vert")',
        menuItem: 'button[role="menuitem"]',
        renameOption: 'Rename|Přejmenovat',
        downloadOption: 'Stáhnout|Download',
        renameInput: 'input[type="text"].rename-input, mat-dialog-container input',
    },
    audio: {
        customizeButtonEn: 'button[aria-label="Customize audio overview"]',
        customizeButtonCs: 'button[aria-label="Přizpůsobit audio přehled"]',
        customizeTextareaCs: 'textarea[aria-label="Textové pole"]',
        customizeTextareaPlaceholder: 'textarea[placeholder*="Co byste mohli"]',
        generateButtonCs: 'button:has-text("Vygenerovat")',
        generateButtonEn: 'button:has-text("Generate")',
        audioOverviewButtonCs: '[aria-label="Audio přehled"]',
        audioOverviewButtonEn: '[aria-label="Audio Overview"]',
        audioOverviewButtonText: 'button:has-text("Audio přehled")',
        generatingIndicatorCs: 'Generování',
        generatingIndicatorEn: 'Generating',
    },
    download: {
        moreButton: 'button mat-icon:has-text("more_vert")',
        downloadMenuItemCs: 'Stáhnout',
        downloadMenuItemEn: 'Download',
        menuVisible: '[role="menu"]',
    },
    chat: {
        input: 'textarea[placeholder*="Začněte psát"], textarea[placeholder*="Tady můžete pokládat"], textarea[placeholder*="Ask a question"]',
        submitButton: 'button[aria-label*="Odeslat"], button[aria-label*="Submit"], button[aria-label*="Send"]',
        messageContainer: 'conversation-view',
        lastMessage: 'message-bubble:last-of-type .message-content, user-message:last-of-type .message-content',
        thinkingIndicator: 'mat-progress-bar, mat-spinner',
    },
    gemini: {
        auth: {
            acceptAll: 'button:has-text("Accept all"), button:has-text("Přijmout vše")',
            dismiss: 'button:has-text("Ne, díky"), button:has-text("No thanks")',
            signIn: 'button:has-text("Sign in")',
            welcome: 'button:has-text("Got it")',
        },
        model: {
            trigger: 'button[aria-label*="Model"]',
            menu: '[role="menu"]',
            item: '[role="menuitem"]',
            advanced: 'button:has-text("Advanced")',
            flash: 'text="Rychlý"|text="Flash"',
            thinking: 'text="S myšlením"|text="Deep Think"|text="Thinking"',
            pro: 'text="Pro"|text="Gemini Pro"',
        },

        chat: {
            app: 'chat-app',
            input: 'div[contenteditable="true"]',
            send: 'button[aria-label*="Send"]',
            response: 'model-response',
            history: '.chat-history-list',
            newChat: 'button[aria-label*="New chat"]',
            thoughtToggle: 'button[aria-label*="Show reasoning"], button[aria-label*="Show thoughts"], mat-expansion-panel-header, button[aria-label*="Zobrazit uvažování"], button:has-text("Zobrazit uvažování"), button:has-text("Show reasoning")',
            thoughtContainer: '.thought-process-content, .reasoning-content, .model-response-reasoning',
        },
        sidebar: {
            menu: 'button[aria-label*="Main menu"]',
            conversations: 'div.conversation[role="button"]',
            showMore: 'button:has-text("Show more")',
            myStuff: 'text=/My Stuff/i',
            gems: 'text=/Gem/i',
        },
        deepResearch: {
            panel: 'deep-research-immersive-panel',
            documentCard: 'div.library-item-card',
            documentTitle: '.title',
            toolbarTitle: 'h2.title-text',
            immersiveTitle: 'h1',
        },
        gems: {
            card: '[class*="gem-card"]',
            name: '.title',
            create: 'button:has-text("Create")',
            nameInput: 'input[placeholder*="name" i]',
            instructionInput: 'textarea[placeholder*="instruction" i]',
            save: 'button:has-text("Save")',
        },
        upload: {
            button: 'button[aria-label*="Add" i]',
            fileInput: 'input[type="file"]',
            uploadFile: 'button:has-text("Upload")',
            drive: 'text="Přidat z Disku"|text="Drive"',
            photos: 'text="Fotky"|text="Photos"',
            importCode: 'text="Importovat kód"|text="Import code"',
            notebooklm: 'text="NotebookLM"',
        }
    }
};

let cachedSelectors: NotebookLMSelectors | null = null;

/**
 * Load selectors from YAML configuration file.
 * Falls back to hardcoded defaults if file is missing or invalid.
 */
export function loadSelectors(): NotebookLMSelectors {
    if (cachedSelectors) {
        return cachedSelectors;
    }

    try {
        const yamlPath = path.join(__dirname, 'selectors.yaml');
        if (fs.existsSync(yamlPath)) {
            const content = fs.readFileSync(yamlPath, 'utf-8');
            const parsed = yaml.parse(content) as NotebookLMSelectors;
            cachedSelectors = { ...defaultSelectors, ...parsed };
            console.log('[Selectors] Loaded from selectors.yaml');
        } else {
            console.warn('[Selectors] selectors.yaml not found, using defaults');
            cachedSelectors = defaultSelectors;
        }
    } catch (error) {
        console.error('[Selectors] Failed to load selectors.yaml:', error);
        cachedSelectors = defaultSelectors;
    }

    return cachedSelectors;
}

/**
 * Force reload of selectors from YAML file.
 * Useful for testing or hot-reloading configuration.
 */
export function reloadSelectors(): NotebookLMSelectors {
    cachedSelectors = null;
    return loadSelectors();
}

/**
 * Get all selectors (lazy-loaded and cached).
 */
export const selectors = new Proxy({} as NotebookLMSelectors, {
    get: (_, category: keyof NotebookLMSelectors) => {
        return loadSelectors()[category];
    },
});

export default selectors;
