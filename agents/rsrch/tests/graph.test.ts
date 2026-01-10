import { describe, it, expect, vi } from 'vitest';

describe('graph commands', () => {
  it('should run graph status command', async () => {
    // Mock the jobs data
    mockQuery.mockResolvedValue({
      data: [
        { j: { properties: { status: 'queued' } } },
        { j: { properties: { status: 'running' } } },
        { j: { properties: { status: 'completed' } } },
        { j: { properties: { status: 'failed' } } },
      ],
    });

    // Capture console.log output
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set command-line arguments and run main
    process.argv.push('graph', 'status', '--local');
    await main();

    // Assertions
    expect(logSpy).toHaveBeenCalledWith('✅ FalkorDB connection: OK');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Jobs: 4 total'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Queued: 1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Running: 1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Completed: 1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'));

    // Restore console.log
    logSpy.mockRestore();
  });

  it('should run graph conversations --limit command', async () => {
    // Mock the conversations data
    const now = Date.now();
    mockQuery.mockResolvedValue({
      data: [
        { c: { properties: { id: 'conv1', title: 'Conversation 1', capturedAt: now } }, turnCount: 5 },
        { c: { properties: { id: 'conv2', title: 'Conversation 2', capturedAt: now } }, turnCount: 10 },
      ],
    });

    // Capture console.table output
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    // Set command-line arguments and run main
    process.argv.push('graph', 'conversations', '--limit=2');
    await main();

    // Assertions
    expect(tableSpy).toHaveBeenCalledWith([
      { ID: 'conv1', Title: 'Conversation 1', Turns: 5, Synced: new Date(now).toLocaleString() },
      { ID: 'conv2', Title: 'Conversation 2', Turns: 10, Synced: new Date(now).toLocaleString() },
    ]);

    // Restore console.table
    tableSpy.mockRestore();
  });

  it('should run graph export --format=json command', async () => {
    // Mock conversation and turn data
    const now = Date.now();
    mockQuery.mockResolvedValueOnce({
      data: [
        { c: { properties: { id: 'conv1', title: 'Test Conversation', platform: 'gemini', type: 'test', capturedAt: now } } },
      ],
    }).mockResolvedValueOnce({
      data: [
        { t: { properties: { role: 'user', content: 'Hello', timestamp: now } } },
        { t: { properties: { role: 'assistant', content: 'Hi there!', timestamp: now + 1 } } },
      ],
    });

    // Mock fs.writeFileSync to capture output
    const writeSpy = vi.spyOn(require('fs'), 'writeFileSync').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set command-line arguments and run main
    process.argv.push('graph', 'export', '--format=json', '--output=./exports');
    await main();

    // Assertions
    expect(writeSpy).toHaveBeenCalled();
    const writtenContent = JSON.parse(writeSpy.mock.calls[0][1]);
    expect(writtenContent.conversation.title).toBe('Test Conversation');
    expect(writtenContent.turns).toHaveLength(2);
    expect(writtenContent.turns[0].content).toBe('Hello');

    // Restore mocks
    writeSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('should run graph citations command', async () => {
    // Mock citations data
    const now = Date.now();
    mockQuery.mockResolvedValue({
      data: [
        { c: { properties: { id: 'cite1', domain: 'example.com', url: 'https://example.com/1', firstSeenAt: now } } },
        { c: { properties: { id: 'cite2', domain: 'example.org', url: 'https://example.org/2', firstSeenAt: now } } },
      ],
    });

    // Capture console.table output
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

    // Set command-line arguments and run main
    process.argv.push('graph', 'citations');
    await main();

    // Assertions
    expect(tableSpy).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ Domain: 'example.com' }),
      expect.objectContaining({ Domain: 'example.org' }),
    ]));

    // Restore console.table
    tableSpy.mockRestore();
  });
});
