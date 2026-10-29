import { MAPS } from './data.js';
import { MAP_CATEGORIES, discoverMaps, mapBrief, mapSketch } from './map-discovery.js';
export function setupMapDiscovery() {
  const select=document.querySelector('#map-select'),dialog=document.querySelector('#map-browser'),list=document.querySelector('#map-browser-list'),search=document.querySelector('#map-browser-search'),summary=document.querySelector('#selected-map-summary');
  let category='all';
  const sync=()=>{const brief=mapBrief(select.value);summary.textContent=brief?`${brief.category} · ${brief.special}。${brief.tip}`:'';};
  const render=()=>{
    const ids=discoverMaps([...select.options].map(o=>o.value),category,search.value);list.replaceChildren();
    document.querySelector('#map-browser-count').textContent=`找到 ${ids.length} 个战场`;
    for(const id of ids){const m=MAPS[id],b=mapBrief(id),card=document.createElement('button');card.type='button';card.className='map-browser-card';card.dataset.mapChoice=id;card.setAttribute('aria-pressed',String(id===select.value));card.innerHTML=mapSketch(id);
      for(const [tag,text] of [['strong',m.name],['small',`${b.category} · 基础尺寸 ${b.size} · 地形示意`],['span',b.tip],['small',b.special]]){const node=document.createElement(tag);node.textContent=text;card.append(node);}
      card.addEventListener('click',()=>{select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();select.focus();});list.append(card);
    }
    if(!ids.length){const p=document.createElement('p');p.textContent='没有匹配的战场，试试其他分类或关键词。';list.append(p);}
  };
  const filters=document.querySelector('#map-browser-filters');
  for(const [id,label] of Object.entries(MAP_CATEGORIES)){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.mapFilter=id;b.setAttribute('aria-pressed',String(id===category));b.addEventListener('click',()=>{category=id;for(const btn of filters.children)btn.setAttribute('aria-pressed',String(btn===b));render();});filters.append(b);}
  for(const button of document.querySelectorAll('[data-map-browser]'))button.addEventListener('click',()=>{category='all';search.value='';for(const btn of filters.children)btn.setAttribute('aria-pressed',String(btn.dataset.mapFilter==='all'));render();dialog.showModal();search.focus();});
  document.querySelector('#map-browser-close').addEventListener('click',()=>dialog.close());search.addEventListener('input',render);select.addEventListener('change',sync);sync();
}
