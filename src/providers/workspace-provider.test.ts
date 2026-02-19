import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  truncate,
  buildContext,
  buildCodingAgentSummary,
  createWorkspaceProvider,
} from './workspace-provider';
import type { WorkspaceBootstrapFile } from './workspace';
import type { CodingAgentContext, CodingIteration } from '../services/coding-agent-context';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';

// Mock dependencies
vi.mock('./workspace', () => ({
  loadWorkspaceBootstrapFiles: vi.fn(),
  filterBootstrapFilesForSession: vi.fn((files) => files),
  DEFAULT_AGENT_WORKSPACE_DIR: '/mock/workspace/dir',
}));

import { loadWorkspaceBootstrapFiles, filterBootstrapFilesForSession } from './workspace';

describe('Workspace Provider', () => {
  const mockFiles: WorkspaceBootstrapFile[] = [
    { name: 'AGENTS.md', path: '/mock/AGENTS.md', content: 'Agent Content', missing: false },
    { name: 'TOOLS.md', path: '/mock/TOOLS.md', content: 'Tools Content', missing: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (loadWorkspaceBootstrapFiles as any).mockResolvedValue(mockFiles);
    (filterBootstrapFilesForSession as any).mockImplementation((files: WorkspaceBootstrapFile[]) => files);
  });

  describe('truncate', () => {
    it('should return original content if length is within max', () => {
      const content = 'Hello world';
      expect(truncate(content, 20)).toBe(content);
    });

    it('should truncate content if length exceeds max', () => {
      const content = 'Hello world, this is a long string';
      const max = 11;
      const expected = 'Hello world\n\n[... truncated at 11 chars]';
      expect(truncate(content, max)).toBe(expected);
    });
  });

  describe('buildContext', () => {
    it('should format file sections correctly', () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: 'AGENTS.md', path: 'p1', content: 'Agent Content', missing: false },
        { name: 'TOOLS.md', path: 'p2', content: 'Tools Content', missing: false },
      ];
      const context = buildContext(files, 1000);
      expect(context).toContain('### AGENTS.md');
      expect(context).toContain('Agent Content');
      expect(context).toContain('### TOOLS.md');
      expect(context).toContain('Tools Content');
    });

    it('should skip missing or empty files', () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: 'AGENTS.md', path: 'p1', content: '', missing: false },
        { name: 'TOOLS.md', path: 'p2', content: 'Tools Content', missing: false },
        { name: 'IDENTITY.md', path: 'p3', missing: true },
      ];
      const context = buildContext(files, 1000);
      expect(context).not.toContain('### AGENTS.md');
      expect(context).toContain('### TOOLS.md');
      expect(context).not.toContain('### IDENTITY.md');
    });

    it('should respect per-file truncation', () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: 'AGENTS.md', path: 'p1', content: 'Long content here', missing: false },
      ];
      const context = buildContext(files, 5);
      expect(context).toContain('[... truncated at 5 chars]');
      expect(context).toContain('[TRUNCATED]');
    });

    it('should respect total character limit', () => {
       const largeContent = 'a'.repeat(60_000);
       const files: WorkspaceBootstrapFile[] = [
         { name: 'AGENTS.md', path: 'p1', content: largeContent, missing: false },
         { name: 'TOOLS.md', path: 'p2', content: largeContent, missing: false },
         { name: 'IDENTITY.md', path: 'p3', content: 'Should not be here', missing: false },
       ];

       // total will be > 100,000 after second file
       const context = buildContext(files, 100_000); // per file max doesn't truncate
       expect(context).toContain('### AGENTS.md');
       // The second file would make it exceed 100k, so it should be skipped
       expect(context).not.toContain('### TOOLS.md');
       expect(context).not.toContain('### IDENTITY.md');
    });
  });

  describe('buildCodingAgentSummary', () => {
    const mockCtx: CodingAgentContext = {
      sessionId: 'session-1',
      taskDescription: 'Fix a bug',
      workingDirectory: '/app',
      connector: { type: 'local-fs', basePath: '/app', available: true },
      interactionMode: 'fully-automated',
      maxIterations: 5,
      active: true,
      iterations: [],
      allFeedback: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('should generate summary with basic context info', () => {
      const summary = buildCodingAgentSummary(mockCtx);
      expect(summary).toContain('## Coding Agent Session');
      expect(summary).toContain('**Task:** Fix a bug');
      expect(summary).toContain('**Working Directory:** /app');
      expect(summary).toContain('**Iterations:** 0 / 5');
    });

    it('should include errors from the last iteration', () => {
      const ctxWithErrors: CodingAgentContext = {
        ...mockCtx,
        iterations: [
          {
            index: 0,
            startedAt: Date.now(),
            errors: [
              { category: 'compile', message: 'Syntax error', filePath: 'foo.ts', line: 10 }
            ],
            fileOperations: [],
            commandResults: [],
            feedback: [],
            selfCorrected: false,
          }
        ]
      };
      const summary = buildCodingAgentSummary(ctxWithErrors);
      expect(summary).toContain('### Errors to Resolve');
      expect(summary).toContain('[compile] at foo.ts:10: Syntax error');
    });

    it('should include pending human feedback', () => {
      const now = Date.now();
      const ctxWithFeedback: CodingAgentContext = {
        ...mockCtx,
        iterations: [
          {
             index: 0,
             startedAt: now - 1000,
             errors: [],
             fileOperations: [],
             commandResults: [],
             feedback: [],
             selfCorrected: false,
          }
        ],
        allFeedback: [
          { id: '1', timestamp: now, text: 'Use better variable names', type: 'guidance' }
        ]
      };
      const summary = buildCodingAgentSummary(ctxWithFeedback);
      expect(summary).toContain('### Human Feedback');
      expect(summary).toContain('[guidance]: Use better variable names');
    });

    it('should include recent command results', () => {
      const ctxWithCmd: CodingAgentContext = {
        ...mockCtx,
        iterations: [
          {
            index: 0,
            startedAt: Date.now(),
            errors: [],
            fileOperations: [],
            commandResults: [
              { command: 'npm test', exitCode: 1, stdout: '', stderr: '', executedIn: '.', success: false },
              { command: 'ls', exitCode: 0, stdout: '', stderr: '', executedIn: '.', success: true },
            ],
            feedback: [],
            selfCorrected: false,
          }
        ]
      };
      const summary = buildCodingAgentSummary(ctxWithCmd);
      expect(summary).toContain('### Recent Commands');
      expect(summary).toContain('`npm test` → FAIL(1)');
      expect(summary).toContain('`ls` → OK');
    });
  });

  describe('createWorkspaceProvider', () => {
    const runtime = {} as IAgentRuntime;
    const message = {
        agentId: 'agent-1',
        roomId: 'room-1',
        userId: 'user-1',
        content: { text: 'hello' }
    } as Memory;
    const state = {} as State;

    it('should load files and return context', async () => {
      const dir = '/mock/dir/1';
      const provider = createWorkspaceProvider({ workspaceDir: dir });
      const result = await provider.get(runtime, message, state);
      expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledWith(dir);
      expect(result.text).toContain('### AGENTS.md');
      expect(result.text).toContain('Agent Content');
    });

    it('should use provided workspace directory', async () => {
      const provider = createWorkspaceProvider({ workspaceDir: '/custom/dir' });
      await provider.get(runtime, message, state);
      expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledWith('/custom/dir');
    });

    it('should filter files based on session key', async () => {
      const sessionKey = 'subagent-session';
      const msgWithSession = {
        ...message,
        metadata: { sessionKey }
      } as Memory;

      const dir = '/mock/dir/2';
      const provider = createWorkspaceProvider({ workspaceDir: dir });
      await provider.get(runtime, msgWithSession, state);

      expect(filterBootstrapFilesForSession).toHaveBeenCalledWith(mockFiles, sessionKey);
    });

    it('should include coding agent context if present', async () => {
      const codingCtx: CodingAgentContext = {
        sessionId: 'session-1',
        taskDescription: 'Fix a bug',
        workingDirectory: '/app',
        connector: { type: 'local-fs', basePath: '/app', available: true },
        interactionMode: 'fully-automated',
        maxIterations: 5,
        active: true,
        iterations: [],
        allFeedback: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const msgWithCtx = {
        ...message,
        metadata: { codingAgentContext: codingCtx }
      } as Memory;

      const dir = '/mock/dir/3';
      const provider = createWorkspaceProvider({ workspaceDir: dir });
      const result = await provider.get(runtime, msgWithCtx, state);

      expect(result.text).toContain('## Coding Agent Session');
      expect(result.text).toContain('**Task:** Fix a bug');
      expect(result.data).toEqual(expect.objectContaining({
          codingSession: 'session-1'
      }));
    });

    it('should cache loaded files', async () => {
      const dir = '/mock/dir/4';
      const provider = createWorkspaceProvider({ workspaceDir: dir });
      await provider.get(runtime, message, state);
      await provider.get(runtime, message, state);

      // Should be called only once due to caching
      expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      const dir = '/mock/dir/5';
      (loadWorkspaceBootstrapFiles as any).mockRejectedValue(new Error('Read error'));
      const provider = createWorkspaceProvider({ workspaceDir: dir });
      const result = await provider.get(runtime, message, state);

      expect(result.text).toContain('Workspace context unavailable');
      expect(result.text).toContain('Read error');
    });
  });
});
