export const CLAUDE_ALLOWED_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'Bash(pnpm *)',
  'Bash(git add *)', 'Bash(git commit *)', 'Bash(git status *)',
  'Bash(git diff *)', 'Bash(git log *)', 'Bash(git -C *)',
  'Bash(mkdir *)', 'Bash(mv *)', 'Bash(cp *)', 'Bash(rm *)', 'Bash(touch *)',
  'Bash(cat *)', 'Bash(ls *)', 'Bash(jq *)', 'Bash(date *)',
  'Bash(head *)', 'Bash(tail *)', 'Bash(wc *)', 'Bash(find *)',
  'Bash(grep *)', 'Bash(pwd *)', 'Bash(echo *)', 'Bash(which *)',
  'Bash(npx *)', 'Bash(tsx *)', 'Bash(node *)',
  'Bash(kill *)', 'Bash(pkill *)', 'Bash(lsof *)',
  'Bash(cd *)', 'Bash(export *)', 'Bash(source *)', 'Bash(test *)',
  'Bash(curl *)',
  'Bash(sleep *)',
  'Bash(sed *)', 'Bash(sort *)', 'Bash(tee *)',
] as const;

export const CLAUDE_ALLOWED_TOOLS_STR = `${CLAUDE_ALLOWED_TOOLS.join('\n')}\n`;

export function hasLegacyClaudeAllowedToolsSyntax(toolsFromEnv?: string): boolean {
  const parsed = toolsFromEnv?.split('\n').map((tool) => tool.trim()).filter(Boolean) ?? [];
  return parsed.some((tool) => /Bash\([^ )]+:\*\)/.test(tool));
}

export function normalizeClaudeAllowedTools(toolsFromEnv?: string): string[] {
  const parsed = toolsFromEnv?.split('\n').map((tool) => tool.trim()).filter(Boolean) ?? [];
  const hasLegacyColonSyntax = hasLegacyClaudeAllowedToolsSyntax(toolsFromEnv);
  return hasLegacyColonSyntax || parsed.length === 0
    ? [...CLAUDE_ALLOWED_TOOLS]
    : parsed;
}
