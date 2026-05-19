import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function shortHash(value) {
  return value.trim().slice(0, 12) || 'local';
}

function resolveBuildHash() {
  if (process.env.GITHUB_SHA) {
    return shortHash(process.env.GITHUB_SHA);
  }

  try {
    return shortHash(
      execSync('git rev-parse --short=12 HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    return 'local';
  }
}

const filePath = resolve('src/app/build-info.ts');
mkdirSync(dirname(filePath), { recursive: true });
writeFileSync(filePath, `export const BUILD_HASH = '${resolveBuildHash()}';\n`);
