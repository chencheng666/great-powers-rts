import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [name, value] = process.argv.slice(2), taskSpaceId = Number(value);
if (!['audio', 'visual', 'battlefield', 'modern', 'details', 'teams', 'future'].includes(name) || !Number.isInteger(taskSpaceId) || taskSpaceId < 1) {
  throw new Error('用法：node scripts/run-browser-check.mjs audio|visual|battlefield|modern|details|teams|future 当前任务空间编号');
}
// ego-browser 在独立进程执行，显式传递任务空间和输出目录。
const source = readFileSync(join(root, `scripts/verify-${name}-browser.js`), 'utf8');
const code = `globalThis.GAME_QA = ${JSON.stringify({ root, taskSpaceId })};\n${source}`;
execFileSync('ego-browser', ['nodejs', '-e', code], { stdio: 'inherit' });
