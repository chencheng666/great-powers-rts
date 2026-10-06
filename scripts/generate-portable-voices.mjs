import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_LINES } from '../src/audio-data.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const folder = join(root, 'assets/audio/portable');
const temporary = await mkdtemp(join(tmpdir(), 'great-powers-voices-'));
await mkdir(folder, { recursive: true });
const engine = execFileSync('espeak-ng', ['--version'], { encoding: 'utf8' }).split('\n')[0];
const manifest = { generator: engine, generatedOn: '2026-10-06', source: 'https://github.com/espeak-ng/espeak-ng', license: '仅分发原创台词的合成音频，不捆绑 GPL 引擎、系统录音或第三方声音模型。', voice: 'cmn', files: [] };
try {
  for (const [key, lines] of Object.entries(VOICE_LINES)) {
    for (const [index, text] of lines.entries()) {
      const file = `${key}-${index}.wav`, wav = join(temporary, file);
      execFileSync('espeak-ng', ['-v', 'cmn', '-s', '175', '-p', '40', '-a', '115', '-w', wav, text]);
      await copyFile(wav, join(folder, file));
      manifest.files.push({ file, key, index, text });
    }
  }
  await writeFile(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已生成 ${manifest.files.length} 条可随离线包分发的中文合成播报`);
} finally { await rm(temporary, { recursive: true, force: true }); }
