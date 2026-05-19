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

    async listNotes(options: { limit?: number; offset?: number; query?: string } = {}) {
        return actions.listKeepNotesAction(this.ctx, this.deps, options);
    }

    async createNote(title: string, content: string) {
        return actions.createKeepNoteAction(this.ctx, this.deps, title, content);
    }

    async getNote(identifier: { title?: string; index?: number }) {
        return actions.getKeepNoteAction(this.ctx, this.deps, identifier);
    }

    async updateNote(identifier: { title?: string; index?: number }, updates: { newTitle?: string; newContent?: string; replace?: boolean }) {
        return actions.updateKeepNoteAction(this.ctx, this.deps, identifier, updates);
    }

    async manageLabels(identifier: { title?: string; index?: number }, labelName: string, action: 'add' | 'remove') {
        return actions.manageKeepLabelsAction(this.ctx, this.deps, identifier, labelName, action);
    }

    async grabImageText(identifier: { title?: string; index?: number }) {
        return actions.grabKeepNoteImageTextAction(this.ctx, this.deps, identifier);
    }

    async addCollaborator(identifier: { title?: string; index?: number }, email: string) {
        return actions.addKeepCollaboratorAction(this.ctx, this.deps, identifier, email);
    }

    async setReminder(identifier: { title?: string; index?: number }, reminderText: string) {
        return actions.setKeepReminderAction(this.ctx, this.deps, identifier, reminderText);
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
