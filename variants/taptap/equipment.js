import { FACTIONS, UNITS } from '../../src/data.js';
import { ROBOT_SPECS } from '../../src/lunar-robots.js';
export const EQUIPMENT_SYSTEMS = Object.fromEntries(Object.keys(FACTIONS).map(id => [id, { country: '原创星港工程体系' }]));
export const EQUIPMENT_SOURCES = {};
export function equipmentProfile(faction, type) {
  const d = UNITS[type];
  return d ? { name: type === 'elite' ? FACTIONS[faction].elite : d.name, description: d.desc, country: '原创星港无人体系', category: '原创／科幻机体', source: null } : null;
}
export function equipmentModel(faction, type) {
  if (!UNITS[type]) return `future_${type}`;
  return ROBOT_SPECS[type]?.model || `scifi_${type}`;
}
