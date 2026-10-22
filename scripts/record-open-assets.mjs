import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const records = [
  { id: 'abrams', author: 'Sketlux; yd', license: 'CC0-1.0', source: 'https://opengameart.org/content/abrams-tank', files: ['abrams.glb'] },
  { id: 'f22', author: 'andertan', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/lockheed-martin-f-22-raptor-7e7b3c372e374dda98e70208d09cfdcf', distribution: 'https://models.airframearchive360.com/f22.glb?v=models-2026-08-25', files: ['f22.glb'] },
  { id: 'harbor-crane', author: 'Timothy3D / Poly Haven', license: 'CC0-1.0', source: 'https://polyhaven.com/a/overhead_crane', files: ['harbor-crane.glb'] },
  { id: 'ground', author: 'Rob Tuytel / Poly Haven', license: 'CC0-1.0', source: 'https://polyhaven.com/a/aerial_grass_rock', files: ['ground-diff.jpg', 'ground-nor_gl.jpg', 'ground-rough.jpg'] },
  { id: 'concrete', author: 'Dimitrios Savva; Rico Cilliers / Poly Haven', license: 'CC0-1.0', source: 'https://polyhaven.com/a/concrete_floor_worn_001', files: ['concrete-diff.jpg', 'concrete-nor_gl.jpg', 'concrete-rough.jpg'] }
];
const geometry = JSON.parse(readFileSync(resolve(root, 'assets/third-party/geometry-report.json')));
for (const record of records) {
  record.files = record.files.map(file => {
    const bytes = readFileSync(resolve(root, 'assets/third-party', file));
    return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  if (geometry[record.id]) record.geometry = geometry[record.id].parts;
}
writeFileSync(resolve(root, 'assets/third-party/manifest.json'), JSON.stringify({ verifiedAt: '2026-10-22', attribution: '../../THIRD-PARTY-ASSETS.txt', records }, null, 2));
