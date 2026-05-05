import { Command } from 'commander';
import { registerNotebookCommands } from './notebooks';
import { registerSourceCommands } from './sources';
import { registerAudioCommands } from './audio';
import { registerArtifactCommands } from './artifacts';
import { registerQueryCommands } from './query';

export function registerNotebookLMCommands(notebook: Command) {
    registerNotebookCommands(notebook);
    registerSourceCommands(notebook);
    registerAudioCommands(notebook);
    registerArtifactCommands(notebook);
    registerQueryCommands(notebook);
}
