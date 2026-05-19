import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';

export function registerKeepCommands(keep: Command) {

    keep.command('list')
        .description('List all notes in Google Keep')
        .option('--limit <number>', 'Maximum number of notes to list', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Number of notes to skip', (v) => parseInt(v), 0)
        .option('--query <string>', 'Filter notes by title or content')
        .action(async (opts) => {
            const response = await sendServerRequest('/keep/notes', { limit: opts.limit, offset: opts.offset, q: opts.query }, 'GET');
            if (response && response.success) {
                const notes = response.data;
                console.log(`\n--- Google Keep Notes (${notes.length}) ---`);
                if (notes.length === 0) {
                    console.log('No notes found.');
                } else {
                    notes.forEach((n: any, i: number) => {
                        const tagsStr = n.tags && n.tags.length > 0 ? ` [tags: ${n.tags.join(', ')}]` : '';
                        console.log(`${i + 1}. ${n.title || '(No Title)'}${tagsStr}`);
                        if (n.content) console.log(`   ${n.content.substring(0, 120)}${n.content.length > 120 ? '...' : ''}`);
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

    keep.command('get [title]')
        .description('Get the full un-truncated content of a specific note')
        .option('--index <number>', '1-indexed position of the note', (v) => parseInt(v))
        .option('--limit <number>', 'Limit of notes query subset', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Offset of notes query subset', (v) => parseInt(v), 0)
        .action(async (title, opts) => {
            if (!title && opts.index === undefined) {
                console.error('Error: Please specify either a title or --index.');
                process.exit(1);
            }
            const params: any = {};
            if (title) params.title = title;
            if (opts.index !== undefined) {
                params.index = opts.index;
                params.limit = opts.limit;
                params.offset = opts.offset;
            }

            console.log('Fetching note details...');
            const response = await sendServerRequest('/keep/notes/detail', params, 'GET');
            if (response && response.success) {
                const note = response.data;
                console.log(`\n==================================================`);
                console.log(`Title: ${note.title || '(No Title)'}`);
                if (note.tags && note.tags.length > 0) {
                    console.log(`Labels: ${note.tags.join(', ')}`);
                }
                console.log(`==================================================`);
                console.log(note.content || '(Empty Note)');
                console.log(`==================================================\n`);
            } else {
                console.error('Failed to retrieve note detail.');
            }
        });

    keep.command('edit [title] <content>')
        .description('Edit an existing note (appends content by default)')
        .option('--index <number>', '1-indexed position of the note', (v) => parseInt(v))
        .option('--limit <number>', 'Limit of notes query subset', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Offset of notes query subset', (v) => parseInt(v), 0)
        .option('--replace', 'Completely replace the note content instead of appending', false)
        .option('--new-title <string>', 'Rename the note title')
        .action(async (title, content, opts) => {
            if (!title && opts.index === undefined) {
                console.error('Error: Please specify either a title or --index.');
                process.exit(1);
            }
            const payload: any = {
                newContent: content,
                replace: opts.replace,
                newTitle: opts.newTitle
            };
            if (title) payload.title = title;
            if (opts.index !== undefined) {
                payload.index = opts.index;
                payload.limit = opts.limit;
                payload.offset = opts.offset;
            }

            console.log('Updating note...');
            const response = await sendServerRequest('/keep/notes', payload, 'PATCH');
            if (response && response.success) {
                console.log('Note updated successfully.');
            } else {
                console.error('Failed to update note.');
            }
        });

    keep.command('label <action> <labelName> [title]')
        .description('Add or remove a label on a note')
        .option('--index <number>', '1-indexed position of the note', (v) => parseInt(v))
        .option('--limit <number>', 'Limit of notes query subset', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Offset of notes query subset', (v) => parseInt(v), 0)
        .action(async (action, labelName, title, opts) => {
            if (action !== 'add' && action !== 'remove') {
                console.error('Error: Action must be "add" or "remove".');
                process.exit(1);
            }
            if (!title && opts.index === undefined) {
                console.error('Error: Please specify either a title or --index.');
                process.exit(1);
            }
            const payload: any = {
                labelName,
                action
            };
            if (title) payload.title = title;
            if (opts.index !== undefined) {
                payload.index = opts.index;
                payload.limit = opts.limit;
                payload.offset = opts.offset;
            }

            console.log(`Managing label: ${action} "${labelName}"...`);
            const response = await sendServerRequest('/keep/notes/labels', payload, 'POST');
            if (response && response.success) {
                console.log(`Label "${labelName}" ${action === 'add' ? 'added' : 'removed'} successfully.`);
            } else {
                console.error('Failed to update label.');
            }
        });

    keep.command('grab-text [title]')
        .description('Perform OCR on images inside a note to extract text')
        .option('--index <number>', '1-indexed position of the note', (v) => parseInt(v))
        .option('--limit <number>', 'Limit of notes query subset', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Offset of notes query subset', (v) => parseInt(v), 0)
        .action(async (title, opts) => {
            if (!title && opts.index === undefined) {
                console.error('Error: Please specify either a title or --index.');
                process.exit(1);
            }
            const payload: any = {};
            if (title) payload.title = title;
            if (opts.index !== undefined) {
                payload.index = opts.index;
                payload.limit = opts.limit;
                payload.offset = opts.offset;
            }

            console.log('Grabbing text from image OCR...');
            const response = await sendServerRequest('/keep/notes/grab-text', payload, 'POST');
            if (response && response.success) {
                console.log('Image text grabbed successfully.');
            } else {
                console.error('Failed to grab image text.');
            }
        });

    keep.command('collaborator <email> [title]')
        .description('Add a collaborator to a specific note')
        .option('--index <number>', '1-indexed position of the note', (v) => parseInt(v))
        .option('--limit <number>', 'Limit of notes query subset', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Offset of notes query subset', (v) => parseInt(v), 0)
        .action(async (email, title, opts) => {
            if (!title && opts.index === undefined) {
                console.error('Error: Please specify either a title or --index.');
                process.exit(1);
            }
            const payload: any = { email };
            if (title) payload.title = title;
            if (opts.index !== undefined) {
                payload.index = opts.index;
                payload.limit = opts.limit;
                payload.offset = opts.offset;
            }

            console.log(`Adding collaborator: ${email}...`);
            const response = await sendServerRequest('/keep/notes/collaborator', payload, 'POST');
            if (response && response.success) {
                console.log('Collaborator added successfully.');
            } else {
                console.error('Failed to add collaborator.');
            }
        });

    keep.command('reminder <reminderText> [title]')
        .description('Set a reminder for a note ("today", "tomorrow", "next-week")')
        .option('--index <number>', '1-indexed position of the note', (v) => parseInt(v))
        .option('--limit <number>', 'Limit of notes query subset', (v) => parseInt(v), 50)
        .option('--offset <number>', 'Offset of notes query subset', (v) => parseInt(v), 0)
        .action(async (reminderText, title, opts) => {
            if (!title && opts.index === undefined) {
                console.error('Error: Please specify either a title or --index.');
                process.exit(1);
            }
            const payload: any = { reminderText };
            if (title) payload.title = title;
            if (opts.index !== undefined) {
                payload.index = opts.index;
                payload.limit = opts.limit;
                payload.offset = opts.offset;
            }

            console.log(`Setting reminder to: ${reminderText}...`);
            const response = await sendServerRequest('/keep/notes/reminder', payload, 'POST');
            if (response && response.success) {
                console.log('Reminder set successfully.');
            } else {
                console.error('Failed to set reminder.');
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
                        const tagsStr = n.tags && n.tags.length > 0 ? ` [tags: ${n.tags.join(', ')}]` : '';
                        console.log(`${i + 1}. ${n.title || '(No Title)'}${tagsStr}`);
                        if (n.content) console.log(`   ${n.content.substring(0, 120)}${n.content.length > 120 ? '...' : ''}`);
                    });
                }
                console.log('-------------------------------------\n');
            }
        });
}
