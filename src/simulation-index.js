// 每个模拟步重建，整个步内实体位置不变；按原数组顺序返回，维持同分目标的选择结果。
export class CombatSpatialIndex {
  constructor(entities,cellSize=512){
    this.cellSize=cellSize;this.cells=new Map();this.entities=entities;
    for(let i=0;i<entities.length;i++){
      const e=entities[i];if(e.hp<=0||e.embarkedIn)continue;
      const key=`${Math.floor(e.x/cellSize)}:${Math.floor(e.y/cellSize)}`;
      if(!this.cells.has(key))this.cells.set(key,[]);
      this.cells.get(key).push(i);
    }
  }
  query(point,radius){
    const indices=[],size=this.cellSize;
    for(let y=Math.floor((point.y-radius)/size);y<=Math.floor((point.y+radius)/size);y++)for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
      const bucket=this.cells.get(`${x}:${y}`);if(bucket)for(const index of bucket)indices.push(index);
    }
    indices.sort((a,b)=>a-b);return indices.map(i=>this.entities[i]);
  }
}
