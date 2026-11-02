import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// 仅优化 uTools 发行副本，保留网页版、原模型和原语音文件。
export async function prepareUtoolsAssets(root) {
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  const cache = join(root, 'releases/utools-media-v1');
  await mkdir(cache, { recursive: true });
  const replacements = new Map(), voices = {};
  async function convert(source, extension, options) {
    const input = await readFile(source);
    const key = createHash('sha256').update(input).update(JSON.stringify(options)).digest('hex').slice(0, 24);
    const target = join(cache, `${key}.${extension}`);
    try { if (!(await stat(target)).size) throw new Error('缓存为空'); } catch {
      const temporary = join(cache, `${key}.next.${extension}`);
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source, ...options, temporary]);
      await rename(temporary, target);
    }
    return target;
  }
  const voiceDirectory = join(root, 'assets/audio/portable');
  for (const file of (await readdir(voiceDirectory)).filter(f => f.endsWith('.wav')).sort()) {
    // 保留所有男女声台词，用 32kbps 单声道 Opus 替代未压缩 PCM。
    const target = await convert(join(voiceDirectory, file), 'ogg', ['-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '24000', '-application', 'voip']);
    voices[`../assets/audio/portable/${file}`] = target;
  }
  for (const file of ['battlefield-key-art.png', 'cai-v121-battle.png']) {
    const target = await convert(join(root, 'assets', file), 'webp', ['-vf', 'scale=1600:1600:force_original_aspect_ratio=decrease', '-c:v', 'libwebp', '-quality', '80', '-frames:v', '1']);
    replacements.set(`../assets/${file}`, target);
    replacements.set(`/assets/${file}`, target);
  }
  const movie = 'videos/battle-montage-20261026.mp4';
  replacements.set(`../assets/${movie}`, await convert(join(root, 'assets', movie), 'mp4', ['-an', '-vf', 'scale=960:-2,fps=24', '-c:v', 'libx264', '-crf', '29', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']));
  const crane = join(root, 'assets/third-party/harbor-crane.glb');
  const source = await readFile(crane), jsonLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  if (source.toString('ascii', 0, 4) !== 'glTF' || source.readUInt32LE(4) !== 2 || gltf.buffers.length !== 1 || gltf.buffers[0].uri) throw new Error('起重机 GLB 结构变化，停止贴图优化');
  const binary = source.subarray(28 + jsonLength);
  const imageViews = new Map((gltf.images || []).map(image => [image.bufferView, image]));
  const chunks = []; let offset = 0;
  for (let index = 0; index < gltf.bufferViews.length; index++) {
    const view = gltf.bufferViews[index];
    let bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const image = imageViews.get(index);
    if (image?.mimeType === 'image/jpeg') {
      const temporary = join(cache, `crane-${index}.jpg`);
      await writeFile(temporary, bytes);
      const target = await convert(temporary, 'jpg', ['-vf', 'scale=512:512:force_original_aspect_ratio=decrease', '-q:v', '4', '-frames:v', '1']);
      bytes = await readFile(target);
    }
    view.byteOffset = offset; view.byteLength = bytes.length;
    const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
    chunks.push(bytes, padding); offset += bytes.length + padding.length;
  }
  gltf.buffers[0].byteLength = offset;
  const json = Buffer.from(JSON.stringify(gltf)), paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20), binaryHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + offset, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binaryHeader.writeUInt32LE(offset); binaryHeader.writeUInt32LE(0x004e4942, 4);
  const compactCrane = join(cache, 'harbor-crane.glb');
  await writeFile(compactCrane, Buffer.concat([header, paddedJson, binaryHeader, ...chunks]));
  replacements.set('../assets/third-party/harbor-crane.glb', compactCrane);
  return {
    name: 'utools-compact-media', enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(join(root, 'src/')) || !/\.(js|css)$/.test(id)) return;
      if (id === join(root, 'src/audio.js')) {
        const entries = Object.entries(voices).map(([key, value]) => `${JSON.stringify(key)}:new URL(${JSON.stringify(relative(dirname(id), value))},import.meta.url).href`);
        const pattern = /import\.meta\.glob\('\.\.\/assets\/audio\/portable\/\*\.wav', \{ eager: true, query: '\?url', import: 'default' \}\)/;
        if (!pattern.test(code)) throw new Error('语音入口变化，停止精简以避免漏音');
        code = code.replace(pattern, () => `{${entries.join(',')}}`);
      }
      for (const [original, target] of replacements) code = code.replaceAll(original, relative(dirname(id), target));
      return { code, map: null };
    }
  };
}
