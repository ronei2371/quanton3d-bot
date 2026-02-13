import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const collectJsFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }
    if (/\.(js|jsx|mjs|cjs)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
};

describe('source integrity', () => {
  it('does not contain stray codex branch tokens inside source files', () => {
    const files = collectJsFiles(path.join(repoRoot, 'src'));
    const offenders = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('codex/')) offenders.push(path.relative(repoRoot, file));
    }

    expect(offenders).toEqual([]);
  });
});
