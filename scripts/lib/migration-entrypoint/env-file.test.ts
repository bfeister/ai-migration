import { describe, expect, it } from 'vitest';
import { parseEnvFile, updateEnvFileContent } from './env-file.js';

describe('env-file helpers', () => {
  it('parses quoted and unquoted values', () => {
    const parsed = parseEnvFile([
      'MONOREPO_SOURCE=/tmp/monorepo',
      'PLAN_FILE="C:\\\\Work Folder\\\\plan.md"',
      '# comment',
      '',
    ].join('\n'));

    expect(parsed.MONOREPO_SOURCE).toBe('/tmp/monorepo');
    expect(parsed.PLAN_FILE).toBe('C:\\Work Folder\\plan.md');
  });

  it('updates existing keys and appends new ones', () => {
    const updated = updateEnvFileContent(
      ['MONOREPO_SOURCE=/tmp/old', 'KEEPALIVE=false'].join('\n'),
      {
        MONOREPO_SOURCE: '/tmp/new path',
        KEEPALIVE: 'true',
        MIGRATION_PLAN: '/tmp/main-plan.md',
      }
    );

    expect(updated).toContain('MONOREPO_SOURCE="/tmp/new path"');
    expect(updated).toContain('KEEPALIVE=true');
    expect(updated).toContain('MIGRATION_PLAN=/tmp/main-plan.md');
  });
});
