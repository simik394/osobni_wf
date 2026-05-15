import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';

export function registerKeepCommands(keep: Command) {

    keep.command('list')
        .description('List all notes in Google Keep')
        .action(async () => {
            const response = await sendServerRequest('/keep/notes', {}, 'GET');
            if (response && response.success) {
                const notes = response.data;
                console.log('\n--- Google Keep Notes ---');
                if (notes.length === 0) {
                    console.log('No notes found.');
                } else {
                    notes.forEach((n: any, i: number) => {
                        console.log(`${i + 1}. ${n.title || '(No Title)'}`);
                        if (n.content) console.log(`   ${n.content.substring(0, 100)}${n.content.length > 100 ? '...' : ''}`);
                    });
                }
                console.log('-------------------------\n');
            }
        });

    keep.command('create <title> <content>')
        .description('Create a new note in Google Keep')
        .action(async (title, content) => {
            const response = await sendServerRequest('/keep/notes', { title, content }, 'POST');
            if (response && response.success) {
                console.log('Note created successfully.');
            } else {
                console.error('Failed to create note.');
            }
        });

    keep.command('delete <title>')
        .description('Delete a note by title')
        .action(async (title) => {
            const response = await sendServerRequest('/keep/notes', { title }, 'DELETE');
            if (response && response.success) {
                console.log(`Note "${title}" deleted successfully.`);
            } else {
                console.error(`Failed to delete note "${title}".`);
            }
        });

    keep.command('archive <title>')
        .description('Archive a note by title')
        .action(async (title) => {
            const response = await sendServerRequest('/keep/notes/archive', { title }, 'POST');
            if (response && response.success) {
                console.log(`Note "${title}" archived successfully.`);
            } else {
                console.error(`Failed to archive note "${title}".`);
            }
        });

    keep.command('search <query>')
        .description('Search for notes')
        .action(async (query) => {
            const response = await sendServerRequest('/keep/search', { q: query }, 'GET');
            if (response && response.success) {
                const notes = response.data;
                console.log(`\n--- Search Results for "${query}" ---`);
                if (notes.length === 0) {
                    console.log('No matching notes found.');
                } else {
                    notes.forEach((n: any, i: number) => {
                        console.log(`${i + 1}. ${n.title || '(No Title)'}`);
                        if (n.content) console.log(`   ${n.content.substring(0, 100)}${n.content.length > 100 ? '...' : ''}`);
                    });
                }
                console.log('-------------------------------------\n');
            }
        });
}
