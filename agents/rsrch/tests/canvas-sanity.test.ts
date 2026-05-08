import { test, expect } from 'vitest';
import { loadSelectors } from '../src/selectors';

test('Gemini Canvas Selector Sanity', async () => {
    const selectors = await loadSelectors();
    
    // Verify that the new selectors are present
    expect(selectors.gemini.session).toBeDefined();
    expect(selectors.gemini.session.filesMenu).toBeDefined();
    expect(selectors.gemini.canvas).toBeDefined();
    expect(selectors.gemini.canvas.sidePanel).toBeDefined();
    
    // Verify Drive picker selectors
    expect(selectors.gemini.upload).toBeDefined();
    expect(selectors.gemini.upload.picker).toBeDefined();
    expect(selectors.gemini.upload.picker.iframe).toBeDefined();
});

test('Gemini Artifact Discovery Logic (Unit/Action)', async () => {
    // This would ideally be a full E2E test, but for now we verify the action structure
    const { listSessionArtifactsAction } = await import('../src/actions/gemini/canvas');
    expect(listSessionArtifactsAction).toBeDefined();
});
