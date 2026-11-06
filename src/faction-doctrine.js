// 提示对应现有战斗规则；原创外观不代表现实装备参数。
export const FACTION_DOCTRINES = Object.freeze({
  china: { silhouette: '双联防空舱 · 高位搜索雷达', role: '防空护卫', squad: ['tank', 'elite', 'supply'], plan: '坦克在前，陆盾护卫，补给车留在后方；守住据点再推进。', weakness: '防空不能替代远程攻城；避免脱离补给追击。' },
  russia: { silhouette: '八轮重底盘 · 多管攻坚火箭舱', role: '远程攻坚', squad: ['scout', 'elite', 'aa'], plan: '先用侦察取得视野，再让破城火箭车打建筑，防空车保护阵地。', weakness: '本阵营防空较弱；被绕后时先撤火力车。' },
  nato: { silhouette: '宽履带 · 楔形重炮塔 · 尾部储物架', role: '重装推进', squad: ['elite', 'aa', 'supply'], plan: '堡垒重坦担当前锋，防空和补给随队，集中火力逐段推进。', weakness: '重坦不能防御高空战机；别把无人机反制当全面防空。' },
  asia: { silhouette: '轮式母车 · 折叠无人模块阵列', role: '机动反甲', squad: ['elite', 'drone', 'scout'], plan: '侦察寻找薄弱侧翼，母车和低成本无人机集中攻击装甲。', weakness: '母车是地面单位，不能跨海；生命较低，避免正面换血。' },
  middleeast: { silhouette: '六轮平台 · 双环脉冲天线', role: '电子压制', squad: ['elite', 'tank', 'ghost'], plan: '侦察无人机提供视野，干扰车压制载具，再由坦克跟进。', weakness: '压制需要目标视野与射程；坦克伤害偏低，不宜独自强攻。' },
});
