import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadSelectors, reloadSelectors, selectors } from '../src/selectors';

// Mock fs and path modules
vi.mock('fs');
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: vi.fn(),
  };
});

describe('selectors', () => {
  // Before each test, reset mocks and ensure the selector cache is in a known state (defaults)
  beforeEach(() => {
    vi.resetAllMocks();

    // Default mock implementations
    vi.mocked(path.join).mockReturnValue('mock/path/selectors.yaml');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Initialize cache with defaults so we start clean
    reloadSelectors();

    // Clear call history so we only assert on calls made during the test
    vi.clearAllMocks();
  });

  describe('loadSelectors', () => {

// start snippet should-return-default-selectors-when-selectors-yam
    it('should return default selectors when selectors.yaml does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Force reload to verify loading logic
      const result = reloadSelectors();

      // Verify defaults are returned
      expect(result.home.createNewButton).toBe('.create-new-button');
      expect(result.notebook.titleInput).toBe('input.title-input');

      // Verify fs.existsSync was called
      expect(fs.existsSync).toHaveBeenCalled();
    });

// end snippet should-return-default-selectors-when-selectors-yam

// start snippet should-load-and-merge-selectors-from-selectors-yam

    it('should load and merge selectors from selectors.yaml when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockYamlContent = `
home:
  createNewButton: '.custom-new-button'
  projectButton: 'custom-project-button'
  projectButtonTitle: '.custom-title'
  projectCard: 'custom-card'
  primaryActionButton: '.custom-action'
notebook:
  titleInput: '.custom-title-input'
  urlPattern: '**/custom/**'
`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);

      // Force reload to pick up new mocks
      const result = reloadSelectors();

      // Verify custom values are loaded
      expect(result.home.createNewButton).toBe('.custom-new-button');
      expect(result.notebook.titleInput).toBe('.custom-title-input');

      // Verify parts not in YAML still have defaults (shallow merge at top level)
      expect(result.sources.tab).toBe('div[role="tab"]');
    });

// end snippet should-load-and-merge-selectors-from-selectors-yam

// start snippet should-fall-back-to-defaults-when-loading-fails-e-

    it('should fall back to defaults when loading fails (e.g. read error)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Simulate an error during read
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read failed');
      });

      // Spy on console.error to suppress output during test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = reloadSelectors();

      expect(result.home.createNewButton).toBe('.create-new-button');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

// end snippet should-fall-back-to-defaults-when-loading-fails-e-
  });

  describe('reloadSelectors', () => {

// start snippet should-force-reload-of-selectors-and-invalidate-ca
    it('should force reload of selectors and invalidate cache', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Mock readFileSync to return different values on consecutive calls
      let callCount = 0;
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        callCount++;
        return `
home:
  createNewButton: '.button-${callCount}'
  projectButton: 'b'
  projectButtonTitle: 'c'
  projectCard: 'd'
  primaryActionButton: 'e'
`;
      });

      // First load (via reloadSelectors to ensure clean start)
      const first = reloadSelectors();
      expect(first.home.createNewButton).toBe('.button-1');
      expect(callCount).toBe(1);

      // Second load via loadSelectors should use cache
      const second = loadSelectors();
      expect(second.home.createNewButton).toBe('.button-1');
      expect(callCount).toBe(1);

      // reloadSelectors should force a new read
      const third = reloadSelectors();
      expect(third.home.createNewButton).toBe('.button-2');
      expect(callCount).toBe(2);
    });

// end snippet should-force-reload-of-selectors-and-invalidate-ca
  });

  describe('selectors proxy', () => {

// start snippet should-trigger-loadselectors-when-accessing-a-prop
    it('should trigger loadSelectors when accessing a property', () => {
      // Accessing selectors.home should trigger the loading mechanism.
      // Since beforeEach set up defaults, this should work.
      // We are verifying that the proxy correctly accesses the underlying loaded object.

      const homeSelectors = selectors.home;
      expect(homeSelectors.createNewButton).toBe('.create-new-button');
    });

// end snippet should-trigger-loadselectors-when-accessing-a-prop
  });
});
