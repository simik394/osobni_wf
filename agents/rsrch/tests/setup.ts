
import { vi } from 'vitest';

const RSRCH_URL = 'http://localhost:3080';
const NTFY_URL = 'https://ntfy.sh';
const NTFY_TOPIC = 'rsrch-audio-test';

const mockDeno = {
  env: {
    get: (key: string) => {
      if (key === 'RSRCH_SERVER_URL') return RSRCH_URL;
      if (key === 'NTFY_SERVER') return NTFY_URL;
      if (key === 'NTFY_TOPIC') return NTFY_TOPIC;
      return undefined;
    },
  },
};

vi.stubGlobal('Deno', mockDeno);

vi.mock('windmill-client', () => ({
  getVariable: vi.fn().mockResolvedValue('mock-variable'),
}));
