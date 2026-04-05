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
        toggle?: string;
        closeButton?: string;
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

let cachedSelectors: NotebookLMSelectors | null = null;

/**
 * Load selectors from YAML configuration file.
 * The YAML MUST exist as it is the primary source of truth.
 */
export function loadSelectors(): NotebookLMSelectors {
    if (cachedSelectors) {
        return cachedSelectors;
    }

    try {
        const yamlPath = path.join(__dirname, 'selectors.yaml');
        if (fs.existsSync(yamlPath)) {
            const content = fs.readFileSync(yamlPath, 'utf-8');
            cachedSelectors = yaml.parse(content) as NotebookLMSelectors;
            console.log('[Selectors] Loaded from selectors.yaml');
        } else {
            throw new Error(`[Selectors] Critical failure: selectors.yaml not found at ${yamlPath}`);
        }
    } catch (error) {
        console.error('[Selectors] Fatal Error:', error);
        throw error; // We want to crash early if configuration is missing
    }

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
