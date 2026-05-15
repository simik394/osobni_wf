import { Page } from 'playwright';
import { config } from '../config';
import { selectors } from '../selectors';
import * as actions from '../actions/keep';
import { NotebookLMActionDeps, UniversalContext } from '../actions/types';

/**
 * Client for Google Keep integration.
 */
export class KeepClient {
    private ctx: UniversalContext;
    private deps: NotebookLMActionDeps;

    constructor(public page: Page) {
        this.ctx = {
            page: this.page,
            log: (msg, level) => console.log(`[Keep] ${msg}`),
            config,
        };
        this.deps = {
            selectors,
        } as NotebookLMActionDeps;
    }

    async listNotes() {
        return actions.listKeepNotesAction(this.ctx, this.deps);
    }

    async createNote(title: string, content: string) {
        return actions.createKeepNoteAction(this.ctx, this.deps, title, content);
    }

    async deleteNote(title: string) {
        return actions.deleteKeepNoteAction(this.ctx, this.deps, title);
    }

    async archiveNote(title: string) {
        return actions.archiveKeepNoteAction(this.ctx, this.deps, title);
    }

    async searchNotes(query: string) {
        return actions.searchKeepNotesAction(this.ctx, this.deps, query);
    }
}
