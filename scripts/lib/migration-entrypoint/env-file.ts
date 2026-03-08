import fs from 'fs';

export type EnvValue = string | undefined;

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    values[key] = parseEnvValue(rawValue);
  }

  return values;
}

export function loadEnvFile(path: string): Record<string, string> {
  if (!fs.existsSync(path)) return {};
  return parseEnvFile(fs.readFileSync(path, 'utf-8'));
}

export function updateEnvFileContent(
  currentContent: string,
  updates: Record<string, EnvValue>
): string {
  const lines = currentContent ? currentContent.split(/\r?\n/) : [];
  const seen = new Set<string>();

  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=)(.*)$/);
    if (!match) return line;

    const [, indent, key, separator] = match;
    if (!(key in updates)) return line;

    seen.add(key);
    const nextValue = updates[key];
    if (nextValue === undefined) return line;
    return `${indent}${key}${separator}${formatEnvValue(nextValue)}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || seen.has(key)) continue;
    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  const normalized = nextLines.join('\n').replace(/\n{3,}/g, '\n\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function writeEnvFile(path: string, updates: Record<string, EnvValue>): void {
  const currentContent = fs.existsSync(path) ? fs.readFileSync(path, 'utf-8') : '';
  fs.writeFileSync(path, updateEnvFileContent(currentContent, updates));
}

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    const inner = value.slice(1, -1);
    return inner
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return value;
}

function formatEnvValue(value: string): string {
  if (value === '') return '""';
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
