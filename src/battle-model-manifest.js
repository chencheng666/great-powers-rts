const buildingNames = ['hq', 'power', 'refinery', 'barracks', 'factory', 'dock', 'radar', 'airfield', 'turret', 'lab', 'super', 'oil', 'armory'];
const names = ['hq', 'power', 'refinery', 'barracks', 'factory', 'dock', 'radar', 'airfield', 'turret', 'lab', 'super', 'tank', 'harvester', 'aa', 'fighter', 'strike', 'drone', 'ghost', 'rifle', 'engineer', 'scout', 'patrol', 'frigate', 'elite_china', 'elite_russia', 'elite_nato', 'elite_asia', 'elite_middleeast', 'oil', 'beacon', 'ore_gold', 'ore_gem', 'tree', 'rock'];
names.push('loiterer', 'jammer', 'laser', 'rocket', 'apc', 'supply', 'destroyer', 'carrier', 'submarine');
names.push('railgun', 'aegis', 'relay', ...['china','russia','nato','asia','middleeast'].flatMap(faction => [`tank_${faction}`, `rocket_${faction}`]), ...buildingNames.filter(name => name !== 'dock').map(name => `future_${name}`), 'future_beacon');
names.push('landing', 'bomber', 'airlift');
names.push('logistics_depot', 'containerShip', 'freightPlane', 'destroyer_china');
names.push('robot_rifle', 'robot_engineer', 'robot_scout');
names.push('armory');

export const BATTLE_MODEL_NAMES = Object.freeze(names);
