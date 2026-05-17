export interface CliContextState {
    profileId: string;
    serverUrl: string;
    verbose: boolean;
}

import { config } from '../config';

const state: CliContextState = {
    profileId: 'default',
    serverUrl: process.env.RSRCH_SERVER_URL || `http://${config.host}:${config.port}`,
    verbose: false
};

export const cliContext = {
    get: () => state,
    set: (newState: Partial<CliContextState>) => {
        Object.assign(state, newState);
    }
};
