import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';

export function registerKeepCommands(program: Command) {
    const keep = program.command('keep')
        .description('Manage Google Keep notes');

    keep.command('list')
        .description('List all notes in Google Keep')
        .action(async () => {
            const response = await sendServerRequest('/keep/notes', {});
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
            const response = await sendServerRequest('/keep/notes', { title, content });
            if (response && response.success) {
                console.log('Note created successfully.');
            } else {
                console.error('Failed to create note.');
            }
        });
}
