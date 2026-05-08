import { Command } from 'commander';
import { registerChatCommands } from './chat.cmd';
import { registerSessionCommands } from './session.cmd';
import { registerSyncCommands } from './sync.cmd';
import { registerUploadCommands } from './upload.cmd';
import { registerGemCommands } from './gems.cmd';
import { registerJobCommands } from './jobs.cmd';
import { registerCanvasCommands } from './canvas.cmd';
import { registerEnvironmentCommands } from './environment.cmd';

const gemini = new Command('gemini').description('Gemini commands');

registerChatCommands(gemini);
registerSessionCommands(gemini);
registerSyncCommands(gemini);
registerUploadCommands(gemini);
registerGemCommands(gemini);
registerJobCommands(gemini);
registerCanvasCommands(gemini);
registerEnvironmentCommands(gemini);

export const geminiCommand = gemini;
export default gemini;
