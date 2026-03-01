// scripts/lib/frontmatter.mjs

/**
 * Zero-dependency YAML frontmatter parser.
 * Extracts name, description, tags, triggers, boundaries, disable-model-invocation.
 * Returns null if no valid frontmatter or no name field.
 */
export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const block = match[1];
  const lines = block.split('\n');

  const result = {
    name: '',
    description: '',
    tags: [],
    triggers: [],
    boundaries: [],
    manual_only: false,
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('name:')) {
      result.name = stripQuotes(line.slice(5).trim());
    } else if (line.startsWith('description:')) {
      const val = line.slice(12).trim();
      if (val === '' || val === '|' || val === '>' || val === '>-' || val === '|-') {
        // Multiline block scalar
        const parts = [];
        i++;
        while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t') || lines[i] === '')) {
          const stripped = lines[i].trim();
          if (stripped) parts.push(stripped);
          i++;
        }
        result.description = parts.join(' ');
        continue;
      } else {
        result.description = stripQuotes(val);
      }
    } else if (line.startsWith('tags:') && line.trim() === 'tags:') {
      result.tags = collectArray(lines, i + 1);
      i = skipArray(lines, i + 1);
      continue;
    } else if (line.startsWith('triggers:') && line.trim() === 'triggers:') {
      result.triggers = collectArray(lines, i + 1);
      i = skipArray(lines, i + 1);
      continue;
    } else if (line.startsWith('boundaries:') && line.trim() === 'boundaries:') {
      result.boundaries = collectArray(lines, i + 1);
      i = skipArray(lines, i + 1);
      continue;
    } else if (line.startsWith('disable-model-invocation:')) {
      const val = line.slice(25).trim();
      result.manual_only = val === 'true';
    }

    i++;
  }

  if (!result.name) return null;
  return result;
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function collectArray(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length && /^\s+-\s/.test(lines[i])) {
    const val = lines[i].replace(/^\s+-\s*/, '').trim();
    items.push(stripQuotes(val));
    i++;
  }
  return items;
}

function skipArray(lines, start) {
  let i = start;
  while (i < lines.length && /^\s+-\s/.test(lines[i])) {
    i++;
  }
  return i;
}
