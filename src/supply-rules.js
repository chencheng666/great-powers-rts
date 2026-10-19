export const SUPPLY = Object.freeze({
  pulse: 1.25,
  repairRate: 24,
  repairStock: .2,
  repairPrice: .3,
  restockPrice: 80,
  restockTime: 6,
  searchRadius: 800,
  searchInterval: 1.5,
  stuckTimeout: 3,
});

export const ammoStockCost = (type, tags) => tags.includes('infantry') ? 1 : ['tank', 'aa', 'elite'].includes(type) ? 2 : 4;
