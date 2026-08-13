const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: text };
  }
  return { frontmatter: parseYamlLines(match[1]), body: text.slice(match[0].length) };
}

export function stringifyFrontmatter(text: string, props: Record<string, unknown>): string {
  const { frontmatter, body } = parseFrontmatter(text);
  const merged = { ...frontmatter, ...props };
  const entries: string[] = [];
  for (const [key, value] of Object.entries(merged)) {
    entries.push(`${key}: ${stringifyYamlValue(value)}`);
  }
  const header = ['---', ...entries, '---'].join('\n');
  if (body.length === 0 || body.startsWith('\n')) {
    return `${header}\n${body}`;
  }
  return `${header}\n\n${body}`;
}

export function stringifyYamlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    // Quote strings that would re-parse as another scalar type (bool, null,
    // number) so user data round-trips faithfully.
    if (
      value === '' ||
      /[:#\n"'[\]{}]/.test(value) ||
      value !== value.trim() ||
      /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/i.test(value.trim())
    ) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function parseYamlLines(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!key) {
      continue;
    }
    out[key] = parseYamlScalar(line.slice(idx + 1).trim());
  }
  return out;
}

function parseYamlScalar(raw: string): unknown {
  if (raw === '') {
    return '';
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(',').map((part) => parseYamlScalar(part.trim()));
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null' || raw === '~') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  const quoted = raw.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) {
    return quoted[2];
  }
  return raw;
}
