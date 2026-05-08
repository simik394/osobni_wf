import { Command } from 'commander';
import { runLocalKeepAction } from '../cli/utils';

export function registerKeepCommands(program: Command) {
    const keep = program.command('keep')
        .description('Manage Google Keep notes');

    keep.command('list')
        .description('List all notes in Google Keep')
        .option('--local', 'Use local execution', true)
        .action(async () => {
            await runLocalKeepAction(async (browser, client) => {
                const notes = await client.listNotes();
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
            });
        });

    keep.command('create <title> <content>')
        .description('Create a new note in Google Keep')
        .option('--local', 'Use local execution', true)
        .action(async (title, content) => {
            await runLocalKeepAction(async (browser, client) => {
                const success = await client.createNote(title, content);
                if (success) {
                    console.log('Note created successfully.');
                } else {
                    console.error('Failed to create note.');
                }
            });
        });
}
