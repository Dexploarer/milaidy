import { describe, it, expect, vi, beforeEach } from 'vitest';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from './milady-root';

vi.mock('node:fs');
vi.mock('node:fs/promises');

describe('milady-root utils', () => {
  const MOCK_ROOT = path.join('/mock', 'root', 'dir');
  const NON_ROOT = path.join('/mock', 'other', 'dir');

  beforeEach(() => {
    vi.clearAllMocks();

    const mockReadFileSync = vi.fn((filePath) => {
      if (filePath === path.join(MOCK_ROOT, 'package.json')) {
        return JSON.stringify({ name: 'milady' });
      }
      if (filePath === path.join(NON_ROOT, 'package.json')) {
        return 'invalid json';
      }
      return JSON.stringify({ name: 'other' });
    });
    vi.mocked(fsSync.readFileSync).mockImplementation(mockReadFileSync as any);

    const mockReadFile = vi.fn(async (filePath) => {
      if (filePath === path.join(MOCK_ROOT, 'package.json')) {
        return JSON.stringify({ name: 'milady' });
      }
      if (filePath === path.join(NON_ROOT, 'package.json')) {
        return 'invalid json';
      }
      return JSON.stringify({ name: 'other' });
    });
    vi.mocked(fs.readFile).mockImplementation(mockReadFile as any);
  });

  describe('resolveMiladyPackageRoot', () => {
    it('resolves root using cwd', async () => {
      const result = await resolveMiladyPackageRoot({ cwd: path.join(MOCK_ROOT, 'src', 'utils') });
      expect(result).toBe(MOCK_ROOT);
    });

    it('returns null if not found (invalid json handling)', async () => {
      const result = await resolveMiladyPackageRoot({ cwd: path.join(NON_ROOT, 'src', 'utils') });
      expect(result).toBeNull();
    });

    it('continues searching if reading an intermediate package.json fails completely', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('fail'));
      const result = await resolveMiladyPackageRoot({ cwd: path.join(MOCK_ROOT, 'src', 'utils') });
      expect(result).toBe(MOCK_ROOT);
    });

    it('resolves root using argv1', async () => {
      const result = await resolveMiladyPackageRoot({ argv1: path.join(MOCK_ROOT, 'bin', 'cli.js') });
      expect(result).toBe(MOCK_ROOT);
    });

    it('resolves root using argv1 pointing to a node_modules .bin executable', async () => {
      const result = await resolveMiladyPackageRoot({ argv1: path.join(MOCK_ROOT, 'node_modules', '.bin', 'milady') });
      expect(result).toBe(MOCK_ROOT);
    });

    it('resolves root using moduleUrl', async () => {
      const moduleUrl = `file://${path.join(MOCK_ROOT, 'src', 'utils', 'milady-root.ts').replace(/\\/g, '/')}`;
      const result = await resolveMiladyPackageRoot({ moduleUrl });
      expect(result).toBe(MOCK_ROOT);
    });

    it('handles multiple nested package.json files correctly', async () => {
        vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
            if (filePath === path.join(MOCK_ROOT, 'src', 'package.json')) {
                return JSON.stringify({ name: 'other' });
            }
            if (filePath === path.join(MOCK_ROOT, 'package.json')) {
                return JSON.stringify({ name: 'milady' });
            }
            throw new Error('Not found');
        });
        const result = await resolveMiladyPackageRoot({ cwd: path.join(MOCK_ROOT, 'src', 'utils') });
        expect(result).toBe(MOCK_ROOT);
    });
  });

  describe('resolveMiladyPackageRootSync', () => {
    it('resolves root using cwd synchronously', () => {
      const result = resolveMiladyPackageRootSync({ cwd: path.join(MOCK_ROOT, 'src', 'utils') });
      expect(result).toBe(MOCK_ROOT);
    });

    it('returns null if not found synchronously', () => {
      const result = resolveMiladyPackageRootSync({ cwd: path.join(NON_ROOT, 'src', 'utils') });
      expect(result).toBeNull();
    });

    it('handles file system read errors safely', () => {
       vi.mocked(fsSync.readFileSync).mockImplementation(() => {
          throw new Error('Not found');
       });
       const result = resolveMiladyPackageRootSync({ cwd: path.join(NON_ROOT, 'src', 'utils') });
       expect(result).toBeNull();
    });

    it('resolves using argv1 synchronously', () => {
      const result = resolveMiladyPackageRootSync({ argv1: path.join(MOCK_ROOT, 'node_modules', '.bin', 'milady') });
      expect(result).toBe(MOCK_ROOT);
    });
  });
});
