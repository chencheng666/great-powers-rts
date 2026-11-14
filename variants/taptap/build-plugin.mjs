import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as base from '../../src/data.js';
import { scifiDataSource, fictionText, SCIFI_TITLE, SCIFI_BUILD, SCIFI_VERSION } from './config.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), variant = join(root, 'variants/taptap');
const overrides = {
  'open-assets.js': 'export async function loadOpenAssets(){return {}} export function installOpenModels(){} export function validateOpenModel(){return false} export function openAssetDetail(){return \'far\'} export function syncOpenAssetLOD(){} export function modelShotOrigin(){return null}',
  'equipment.js': await readFile(join(variant, 'equipment.js'), 'utf8'),
  'visual-assets.js': await readFile(join(variant, 'visual-assets.js'), 'utf8'),
  'player-telemetry.js': 'export class PlayerTelemetry { identify(){} tick(){} error(){} flush(){return Promise.resolve(false)} }',
  'honor-recovery.js': 'export function restoreRelatedHonors(){}',
  'growth-ui.js': '', 'feedback-ui.js': '',
  'background-video.js': 'export function setupMenuVideo(){return {pause(){},resume(){}}}',
  'deterrence.js': 'export const deterrenceCombat={nuclearReady(){return false},launchNuclear(){return false},nuclearWarnings(){return[]},updateDeterrence(){},updateNuclearProjectile(){return false}};',
  'online-client.js': 'export class OnlineClient {constructor(){this.user=null;this.room=null} async connect(){throw Error("此版本仅支持本地单机演习")} close(){} disconnect(){} }',
  'desktop-updates.js': 'export function setupDesktopUpdates(){}',
};
const plugin = {
  name: 'starport-independent-edition',
  async load(id) {
    if (id.includes('/assets/third-party/')) throw new Error('科幻包不能引用原版第三方现实装备或材质');
    if (id.startsWith(join(root, 'src')) && id.endsWith('.css')) return (await readFile(id, 'utf8')).replace(/url\([^)]*\)/g, value => value.includes('player-ranks-v1.webp') ? value : 'none');
    if (id.includes('/assets/models/')) throw new Error('科幻包不能引用官网现实装备模型库');
    if (id.includes('/assets/videos/')) throw new Error('科幻包不能引用官网现代战斗视频');
    if (id.includes('/assets/audio/') && !/\/(iron-tide|east-wind)\.m4a(?:\?|$)/.test(id)) throw new Error('科幻包只分发两首原创器乐');
    if (id.endsWith('/src/data.js')) return scifiDataSource(base);
    // 替换模块仍按 src 位置解析相对导入，避免文案替换误改构建机绝对目录。
    for (const [name, source] of Object.entries(overrides)) if (id === join(root, 'src', name)) return source.replaceAll('../../assets/', '../assets/').replaceAll('../../src/', './').replaceAll("'./assets/starport-library.glb'", "'../variants/taptap/assets/starport-library.glb'");
  },
  transform(source, id) {
    if (id.startsWith(join(root, 'src')) && id.endsWith('.css')) return source.replace(/url\([^)]*\)/g, value => value.includes('player-ranks-v1.webp') ? value : 'none');
    if (!id.startsWith(join(root, 'src')) || !id.endsWith('.js')) return;
    let text = source;
    if (id.endsWith('/main.js')) {
      text = text.replace("candidateMode?'sixfront':'valleyTraining'", "'meridian'").replaceAll('loyalty.tick(state.game, !document.hidden)', 'false').replaceAll('${EQUIPMENT_SYSTEMS[key].country}原型', '${EQUIPMENT_SYSTEMS[key].country}');
      text = text.replace(/function showHelp\(\) \{[\s\S]*?\n\}/, `function showHelp() {
        showModal('星港操作手册', '<p>这里是虚构星港中的无人机体演习。两张月表地图均可选择新兵、标准或专家难度，以及基地对抗、全域清理、信标控制三种目标。</p><p>电脑：左键点选或框选，右键下达移动和目标指令，右拖平移地图。触屏：轻点选中，使用移动／攻击按钮指定目标，拖拽调整地图。</p><p>先供电，再建精炼站和机体装配厂。工程机器人可接管资源与信标，受损机体需要整备，电池不足的机器人要回到供电设施充电。</p><p>暂停菜单可以保存、读取、导入和导出战局。呼号、战局和成绩只保存在本机；本版本不提供联网对战。</p>', '<button class="primary-btn" data-modal="resume">继续演习</button>');
      }`);
    }
    if (id.endsWith('/game.js')) text = text.replace("? options.mapId : 'valley'", "? options.mapId : 'meridian'");
    if (id.endsWith('/audio.js')||id.endsWith('/audio-data.js')||id.endsWith('/main.js'))text=text.replaceAll("'mountain-sea'","'iron-tide'");
    if (id.endsWith('/audio.js')) text = text.replace(/const assets = import\.meta\.glob\([^;]+;/, "const assets = import.meta.glob(['../assets/audio/iron-tide.m4a','../assets/audio/east-wind.m4a'], { eager: true, query: '?url', import: 'default' });").replace(/const portableVoices = import\.meta\.glob\([^;]+;/, 'const portableVoices = {};').replaceAll("'internationale'", "'iron-tide'");
    if (id.endsWith('/tutorial-ui.js')) text = text.replaceAll("'valleyTraining'", "'meridian'");
    if (id.endsWith('/version.js')) text = text.replace(/BUILD_ID = '[^']+'/, `BUILD_ID = '${SCIFI_BUILD}'`).replace(/GAME_VERSION = '[^']+'/, `GAME_VERSION = '${SCIFI_VERSION}'`);
    if (id.endsWith('/catalog-data.js')) text = text.replaceAll("mapId = 'valley'", "mapId = 'meridian'");
    return fictionText(text).replaceAll('入门陆战', '星港入门').replaceAll('首次进入需要下载', '首次进入正在准备内置素材').replaceAll('坦克', '机甲').replaceAll('工程师', '工程机器人').replaceAll('步兵', '机器人');
  },
  transformIndexHtml: { order: 'pre', handler(html) {
    return fictionText(html.replace('/src/main.js', '/variants/taptap/entry.js')
      .replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${SCIFI_TITLE}</title>`)
      .replace(/<video\b[\s\S]*?<\/video>/g, '<div class="scifi-backdrop" aria-hidden="true"></div>')
      .replace(/(<select[^>]*id="map-select"[^>]*>)[\s\S]*?<\/select>/, '$1<option value="meridian">子午星港 · 基地与信标</option><option value="moonsea">月海晶矿区 · 采集与电网</option></select>')
      .replace(/<option value="(?:internationale|mountain-sea|war-theme|final-battle)">[^<]*<\/option>/g, '')
      .replace(/大国崛起 3\.[01] \/ [^<]+/, `星港演习 ${SCIFI_VERSION} · 触屏指挥`)
      .replaceAll('建设基地，调配海陆空力量，开启你的征途。', '建设月表基地，调度无人机甲，在虚构星港完成战术演习。')
      .replace(/<blockquote class="peace-motto">[\s\S]*?<\/blockquote>/, '<p class="scifi-privacy">纯虚构的月表机体演习。经营电网与晶矿，协同调度机器人，守住星港信标。</p>')
      .replace(/<details class="mode-guide">[\s\S]*?<\/details>/, '<details class="mode-guide"><summary>第一次怎么开始？</summary><p>选择子午星港和新兵难度，从供电、晶矿精炼和机器人装配开始。工程机器人可接管资源及信标，低电量时返回设施充电。</p><p>另一张地图为月海晶矿区。三种胜利目标与三档难度可自由搭配；战局和成绩只在本机保存。</p></details>')
      .replace('<h1>大国<em>崛起</em></h1>', '<h1>星港<em>演习</em></h1>')
      .replaceAll('灰谷入门', '星港入门').replaceAll('原型', '体系').replaceAll('国际歌', '星港启航'));
  }}
};
export default plugin;
