export interface CliContextState {
    profileId: string;
    cdpEndpoint?: string;
    serverUrl: string;
    local: boolean;
    verbose: boolean;
}

const state: CliContextState = {
    profileId: 'default',
    serverUrl: process.env.RSRCH_SERVER_URL || 'http://localhost:3001',
    local: false,
    verbose: false
};

export const cliContext = {
    get: () => state,
    set: (newState: Partial<CliContextState>) => {
        Object.assign(state, newState);
    }
};
