import { describe, expect, it } from 'vitest';
import { normalizeCommandForPlatform } from './command-runner.js';

describe('command runner helpers', () => {
  it('normalizes pnpm and npx to Windows command shims', () => {
    expect(normalizeCommandForPlatform('pnpm', 'win32')).toBe('pnpm.cmd');
    expect(normalizeCommandForPlatform('npx', 'win32')).toBe('npx.cmd');
  });

  it('leaves unrelated or already-qualified commands unchanged on Windows', () => {
    expect(normalizeCommandForPlatform('git', 'win32')).toBe('git');
    expect(normalizeCommandForPlatform('pnpm.cmd', 'win32')).toBe('pnpm.cmd');
    expect(normalizeCommandForPlatform('C:\\tools\\custom.exe', 'win32')).toBe(
      'C:\\tools\\custom.exe'
    );
  });

  it('leaves commands unchanged on non-Windows platforms', () => {
    expect(normalizeCommandForPlatform('pnpm', 'darwin')).toBe('pnpm');
    expect(normalizeCommandForPlatform('npx', 'linux')).toBe('npx');
  });
});
