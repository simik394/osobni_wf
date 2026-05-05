import { Command } from 'commander';
import { registerNotebookLMCommands } from './notebooklm/registry';

const notebook = new Command('notebook').description('NotebookLM commands');

// Register all modular commands
registerNotebookLMCommands(notebook);

export const notebookCommand = notebook;
