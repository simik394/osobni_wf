/**
 * NotebookLM Selector Configuration
 * 
 * Loads selector configuration from selectors.yaml for easier maintenance.
 * When NotebookLM/Gemini UI changes, update selectors.yaml instead of client code.
 * 
 * @module selectors
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

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
    thoughtToggle?: string;
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
        citations: string;
        thoughtToggle?: string;
        thoughtContainer?: string;
    };
    sidebar: {
        container: string;
        conversations: string;
        showMore?: string;
        pinnedIndicator?: string;
        searchToggle?: string;
        searchInput?: string;
        myStuff?: string;
        menu: string;
        gems: string;
    };
    deepResearch: {
        panel: string;
        documentCard: string;
        documentTitle: string;
        toggle?: string;
        citation?: string;
        sourcesHeader?: string;
        sourceLink?: string;
        thoughtsSection?: string;
        immersiveTitle?: string;
    };
    gems: {
        card: string;
        name: string;
        create: string;
        nameInput: string;
        instructionInput: string;
        save: string;
        updateButton: string;
    };
    upload: {
        button: string;
        fileInput: string;
        uploadFile: string;
        drive: string;
        photos: string;
        importCode: string;
        notebooklm: string;
        picker: {
            iframe: string;
            search: string;
            fileRow: string;
            selectButton: string;
        };
    };
    canvas: {
        sidePanel: string;
        header: string;
        navButton: string;
        previewTab: string;
        codeTab: string;
        content: string;
        close: string;
    };
    session: {
        moreMenu: string;
        filesMenu: string;
        artifactItem: string;
        share: string;
        menuShare: string;
        copyLink: string;
        pin: string;
        unpin: string;
    };
}

export interface PerplexitySelectors {
    queryInput: string | string[];
    followUpInput: string;
    answerContainer: string;
}

export interface AIModeSelectors {
    entryUrl: string;
    myActivityUrl: string;
    sidebar: {
        dialog: string;
        trigger: string;
        historyItem: string;
        showMore: string;
        mySearchHistory: string;
    };
    myActivity: {
        activityItem: string;
        activityItemFallback: string;
        detailsButton: string;
        deleteButton: string;
        deleteDayButton: string;
    };
    conversation: {
        aiResponse: string;
        aiResponseFallback: string;
        turnContainer: string;
        turnRoot: string;
        mainContent: string;
        userQuery: string;
        codeBlock: string;
        inlineCode: string;
        citationChip: string;
        textLink: string;
        textLinkFallback: string;
        sourceCard: string;
        sourcePanel: string;
        followUpInput: string;
        copyButton: string;
        shareButton: string;
        feedbackGood: string;
        feedbackBad: string;
        disclaimer: string;
    };
    auth: {
        acceptAll: string;
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
    perplexity: PerplexitySelectors;
    aiMode: AIModeSelectors;
}

// ============================================================
// CONFIG LOADER
// ============================================================

const DEFAULTS: NotebookLMSelectors = {
    home: {
        createNewButton: '.create-new-button, .create-new-action-button',
        projectButton: 'div[role="button"]',
        projectButtonTitle: '.project-title',
        projectCard: '.project-card',
        primaryActionButton: '.primary-action'
    },
    notebook: {
        titleInput: 'input.title-input',
        urlPattern: '**/notebook/**'
    },
    sources: {
        tab: 'div[role="tab"]',
        tabTextPattern: 'Sources',
        addSourcesButton: 'button:has-text("Add")',
        dropZoneButton: '.drop-zone',
        webSourcePattern: 'Web',
        pasteTextPattern: 'Paste',
        drivePattern: 'Drive',
        urlInputTextarea: 'textarea',
        submitButton: 'button[type="submit"]',
        dialogContainer: '.dialog',
        selectAllInputEn: 'Select all',
        selectAllInputCs: 'Vybrat vše',
        drivePickerFrame: 'iframe',
        driveSearchInput: 'input[type="search"]',
        driveFileRow: '.file-row',
        driveSelectButton: 'button:has-text("Select")'
    },
    studio: {
        maximizeButton: 'button[aria-label="Maximize"]',
        artifactButton: '.artifact-button',
        artifactLibraryItem: '.library-item',
        artifactTitle: '.artifact-title',
        audioIcon: '.audio-icon',
        audioIconPattern: 'Audio',
        moreMenuButton: '.more-menu',
        moreMenuIcon: '.more-icon',
        menuItem: 'div[role="menuitem"]',
        renameOption: 'Rename',
        downloadOption: 'Download',
        renameInput: 'input.rename-input'
    },
    audio: {
        customizeButtonEn: 'Customize',
        customizeButtonCs: 'Upravit',
        customizeTextareaCs: 'Zadejte pokyny',
        customizeTextareaPlaceholder: 'How should the audio sound?',
        generateButtonCs: 'Generovat',
        generateButtonEn: 'Generate',
        audioOverviewButtonCs: 'Přehled audia',
        audioOverviewButtonEn: 'Audio Overview',
        audioOverviewButtonText: 'Audio Overview',
        generatingIndicatorCs: 'Generování',
        generatingIndicatorEn: 'Generating'
    },
    download: {
        moreButton: 'button.more-button',
        downloadMenuItemCs: 'Stáhnout',
        downloadMenuItemEn: 'Download',
        menuVisible: '.menu-visible'
    },
    chat: {
        input: 'div[contenteditable="true"]',
        submitButton: 'button[aria-label="Send"]',
        messageContainer: '.message-container',
        lastMessage: '.message:last-child',
        thinkingIndicator: '.thinking'
    },
    gemini: {
        auth: {
            acceptAll: 'Accept all',
            dismiss: 'Dismiss',
            signIn: 'Sign in',
            welcome: 'Welcome'
        },
        model: {
            trigger: '.model-trigger',
            menu: '.model-menu',
            item: '.model-item',
            advanced: 'Advanced',
            flash: 'Flash',
            thinking: 'Thinking',
            pro: 'Pro'
        },
        chat: {
            app: '.gemini-app',
            input: 'div[contenteditable="true"]',
            send: 'button[aria-label="Send"]',
            response: '.model-response',
            history: '.chat-history',
            newChat: 'New chat',
            citations: '.citation-chip'
        },
        sidebar: {
            container: '.conversations-container, [role="navigation"] .scrollable-content',
            conversations: 'a.conversation, a[data-conversation-id], .conversation-item',
            showMore: 'button:has-text("Show more"), button:has-text("Zobrazit další")',
            pinnedIndicator: 'mat-icon:has-text("keep"), [aria-label*="pinned" i]',
            searchToggle: 'button[aria-label*="Search" i]',
            searchInput: 'input.search-input',
            myStuff: 'button:has-text("My stuff"), button:has-text("Moje věci")',
            menu: 'button[aria-label*="Menu" i]',
            gems: 'a[href*="/gems/"]'
        },
        deepResearch: {
            panel: '.research-panel, .container[scrollable="true"]',
            documentCard: '.doc-card, [role="article"]:has-text("Deep Research")',
            documentTitle: '.doc-title, h1, h2',
            toggle: '.research-toggle',
            citation: 'button.mat-mdc-tooltip-trigger.button.image-fade-on',
            sourcesHeader: 'button:has-text("Sources used"), button:has-text("Zdroje použité")',
            sourceLink: '.container[scrollable="true"] a[href*="http"]',
            thoughtsSection: 'button:has-text("Thoughts"), button:has-text("Myšlenky")',
            immersiveTitle: '.immersive-title'
        },
        gems: {
            card: '.gem-card',
            name: '.gem-name',
            create: 'Create Gem',
            nameInput: 'input[name="gem-name"]',
            instructionInput: 'textarea[name="instructions"]',
            save: 'Save',
            updateButton: 'button.save-button'
        },
        upload: {
            button: 'button[aria-label="Upload"]',
            fileInput: 'input[type="file"]',
            uploadFile: 'Upload file',
            drive: 'Google Drive',
            photos: 'Google Photos',
            importCode: 'Import code',
            notebooklm: 'NotebookLM',
            picker: {
                iframe: 'iframe.picker-frame',
                search: 'input[type="search"]',
                fileRow: '.picker-grid-tile',
                selectButton: 'button:has-text("Select")'
            }
        },
        canvas: {
            sidePanel: '.canvas-side-panel',
            header: '.canvas-header',
            navButton: '.nav-button',
            previewTab: 'Preview',
            codeTab: 'Code',
            content: '.ql-editor',
            close: 'Close'
        },
        session: {
            moreMenu: '.more-menu',
            filesMenu: 'Files',
            artifactItem: '.artifact-item',
            share: 'button[aria-label*="Share" i]',
            menuShare: 'Share conversation',
            copyLink: 'Copy link',
            pin: 'Pin',
            unpin: 'Unpin'
        }
    },
    perplexity: {
        queryInput: 'textarea[placeholder*="Ask"]',
        followUpInput: 'textarea[placeholder*="follow-up"]',
        answerContainer: '.answer-container'
    },
    aiMode: {
        entryUrl: 'https://myactivity.google.com/',
        myActivityUrl: 'https://myactivity.google.com/product/ai',
        sidebar: {
            dialog: 'div[role="dialog"]',
            trigger: 'button[aria-label*="menu"]',
            historyItem: '.history-item',
            showMore: 'Show more',
            mySearchHistory: 'My search history'
        },
        myActivity: {
            activityItem: '.activity-item',
            activityItemFallback: 'div[role="listitem"]',
            detailsButton: 'Details',
            deleteButton: 'Delete',
            deleteDayButton: 'Delete day'
        },
        conversation: {
            aiResponse: '.ai-response',
            aiResponseFallback: '.response',
            turnContainer: '.turn-container',
            turnRoot: '.turn-root',
            mainContent: '.main-content',
            userQuery: '.user-query',
            codeBlock: 'pre',
            inlineCode: 'code',
            citationChip: '.citation',
            textLink: 'a',
            textLinkFallback: 'a',
            sourceCard: '.source-card',
            sourcePanel: '.source-panel',
            followUpInput: 'textarea',
            copyButton: 'Copy',
            shareButton: 'Share',
            feedbackGood: 'Good',
            feedbackBad: 'Bad',
            disclaimer: '.disclaimer'
        },
        auth: {
            acceptAll: 'Accept all'
        }
    }
};

let cachedSelectors: NotebookLMSelectors | null = null;

/**
 * Load selectors from YAML configuration file.
 * The YAML is merged with hardcoded defaults.
 */
export function loadSelectors(): NotebookLMSelectors {
    if (cachedSelectors) {
        return cachedSelectors;
    }

    const result = JSON.parse(JSON.stringify(DEFAULTS)) as NotebookLMSelectors;

    const yamlPath = path.join(__dirname, 'selectors.yaml');
    if (!fs.existsSync(yamlPath)) {
        throw new Error(`[Selectors] Critical failure: selectors.yaml not found at ${yamlPath}`);
    }

    try {
        const content = fs.readFileSync(yamlPath, 'utf-8');
        if (content) {
            const yamlSelectors = yaml.parse(content) as any;
            
            const deepMerge = (target: any, source: any) => {
                for (const key in source) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        if (!target[key]) target[key] = {};
                        deepMerge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            };

            deepMerge(result, yamlSelectors);
            console.log('[Selectors] Deep-merged selectors from selectors.yaml');
        }
    } catch (error) {
        console.error('[Selectors] Fatal Error:', error);
        // Fall back to defaults instead of throwing
    }

    cachedSelectors = result;
    return cachedSelectors;
}

/**
 * Force reload of selectors from YAML file.
 */
export function reloadSelectors(): NotebookLMSelectors {
    cachedSelectors = null;
    return loadSelectors();
}

/**
 * Get all selectors (lazy-loaded and cached).
 * Returns a categories proxy for easy access: selectors.home.createNewButton
 */
export const selectors = new Proxy({} as NotebookLMSelectors, {
    get: (_, category: string) => {
        return (loadSelectors() as any)[category];
    },
});

export default selectors;
