export const VOICE_LINES = {
  welcome: ['战区通信已接入。指挥官，部队等待您的命令。'],
  construction: ['开始建造。'], buildReady: ['建筑建造完成，等待部署。'], deployed: ['建筑已部署。'],
  queued: ['生产任务已确认。'], unitReady: ['新单位已就绪。'],
  powerLow: ['电力不足。请增建电力站。'], powerRestored: ['供电已恢复。'],
  fundsLow: ['资金不足。'], underAttack: ['警报！我方基地遭到攻击。'],
  buildingLost: ['我方建筑被摧毁。'], unitLost: ['我方单位损失。'],
  oilCaptured: ['油井已占领，经济供给已接入。'], beaconCaptured: ['雷达信标已接入。'],
  ability: ['战略系统已启动。'], victory: ['战役胜利。战区已由我方控制。'], defeat: ['任务失败。部队撤离战区。'], draw: ['战局结束。双方战力耗尽。'],
  structureSelected: ['指挥系统在线。'],
  armorSelected: ['装甲部队待命。', '车组就位，请指示。'],
  infantrySelected: ['小队待命。', '收到，请下达命令。'],
  engineerSelected: ['工程组就位。', '准备接管目标。'],
  airSelected: ['空中编队就绪。', '航电系统正常。'],
  droneSelected: ['无人机链路已接通。'], navySelected: ['舰艇等待指令。'],
  moveOrder: ['收到，正在前往目标位置。', '开始机动。', '部队出发。'],
  attackOrder: ['确认目标，进入战斗。', '火力单元开始推进。'],
  captureOrder: ['工程组出发，准备接管。'], stopOrder: ['停止机动，保持阵位。']
};

export const COMMAND_LINES = new Set(['armorSelected','infantrySelected','engineerSelected','airSelected','droneSelected','navySelected','moveOrder','attackOrder','captureOrder','stopOrder']);
export const VOICE_PRIORITY = { underAttack: 3, defeat: 4, victory: 4, draw: 4, buildingLost: 2, powerLow: 2, fundsLow: 2, unitReady: 1, buildReady: 1, oilCaptured: 1, beaconCaptured: 1, welcome: 2 };
export const VOICE_COOLDOWN = { underAttack: 14, unitLost: 10, buildingLost: 6, fundsLow: 10, queued: 3, unitReady: 3, construction: 2, deployed: 2 };

export function voiceFile(key, index = 0) { return `${key}-${index}.m4a`; }

export function speechOptions(settings, command = false) {
  const value = normalizeAudioSettings(settings);
  return { lang: 'zh-CN', rate: command ? 1.05 : 1, pitch: command ? .9 : 1, volume: value.muted ? 0 : value.master * value.voice };
}

export function normalizeAudioSettings(value = {}) {
  const defaults = { master: .75, music: .35, voice: .95, effects: .5, muted: false };
  const settings = {};
  for (const key of ['master', 'music', 'voice', 'effects']) settings[key] = typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(0, Math.min(1, value[key])) : defaults[key];
  settings.muted = value.muted === true;
  return settings;
}
