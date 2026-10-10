// 桥面挡住正处于同一桥面投影内的上下层直射；不改变沿桥航行或岸边射界。
export function bridgeBlocksDirectShot(map, source, target, units) {
 if (!map.water || source.kind !== 'unit' || target.kind !== 'unit') return false;
 const a=units[source.type]?.tags||[], b=units[target.type]?.tags||[];
 if (a.includes('air') || b.includes('air') || ['rocket','bomber','loiterer','carrier'].includes(source.type)) return false;
 if (a.includes('ship') === b.includes('ship')) return false;
 const water=map.water;
 const onDeck=e=>e.x>=water.x1&&e.x<=water.x2;
 if (!onDeck(source)||!onDeck(target)) return false;
 return (map.bridges||[]).some(bridge=>source.y>=bridge.y1&&source.y<=bridge.y2&&target.y>=bridge.y1&&target.y<=bridge.y2);
}
