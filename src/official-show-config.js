// 演出时序以画面时间为准；跳过、切页和重播不会遗留定时音效。
export const OFFICIAL_SHOWS={
 assault:{name:'海陆空突袭',duration:5,impact:2.8,loops:['jet','tracks'],cues:[[0,'airTakeoff'],[2.1,'tank'],[2.8,'largeImpact']]},
 nuclear:{name:'核弹冲击',duration:5.5,impact:1.65,loops:[],cues:[[0,'nuclearLaunch'],[1.65,'nuclearImpact']]},
 blackhole:{name:'黑洞吞噬',duration:7,impact:null,loops:[],cues:[[0,'sonarPing'],[1.4,'nuclearLaunch'],[3.2,'railgun']]},
 naval:{name:'舰炮齐射',duration:6,impact:3.2,loops:['ship'],cues:[[.4,'frigate'],[1,'frigate'],[1.6,'frigate'],[2.2,'missile'],[3.2,'largeImpact']]},
 helicopter:{name:'旋翼火箭',duration:6,impact:3.3,loops:['rotor'],cues:[[0,'rotorStart'],[1.5,'rocket'],[2,'rocket'],[2.5,'rocket'],[3.3,'explosiveImpact']]},
 railgun:{name:'电磁炮贯穿',duration:5.6,impact:2.6,loops:['tracks'],cues:[[.1,'sonarPing'],[2.2,'railgun'],[2.6,'metalImpact'],[2.8,'largeImpact']]}
};
export function showDefinition(mode){return OFFICIAL_SHOWS[mode]||OFFICIAL_SHOWS.assault;}
