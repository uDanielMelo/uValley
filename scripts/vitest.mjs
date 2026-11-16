// Runs Vitest with a normalized working directory.
// On Windows the workspace may be opened as `c:\...` while Node resolves modules as `C:\...`;
// the mismatch loads Vitest twice and every suite fails with
// "Cannot read properties of undefined (reading 'config')".
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const require = createRequire(join(cwd, 'package.json'));
const bin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const { status } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(status ?? 1);
