# 素材来源与授权范围

本项目是原创、非官方的即时战略试玩游戏，不隶属于《红色警戒》的权利人，也不是官方续作。红色警戒名称及相关商标的权利归其各自权利人；本项目不授予这些商标、官方游戏素材或配音的使用权。

## 项目素材

| 素材 | 文件与来源 | 编辑方式 |
| --- | --- | --- |
| 地表、建筑、植被 | `assets/terrain-valley-v2.png`、`buildings-realistic-v2.png`、`foliage-realistic-v2.png`、`armory-v1.png`；使用 AI 图像生成工具制作 | 复现提示词见 `assets/asset-prompts.json`，建筑和植被使用透明图集 |
| 开场画面 | `assets/battlefield-key-art.png`；AI 生成的原创战场插画 | 不代表实际运行画质，游戏截图位于 `docs/images/` |
| 军事模型 | `assets/models/military-library.glb` 与 `modern-library.glb`；本地 Blender 程序化建模 | 包含 `.blend` 源文件及 `scripts/build_*_assets.py` 生成脚本，共 34 类基础模型模板与 9 类现代单位模板 |
| 无人机重制 | `assets/models/drone-library.glb` 与 `.blend`；本地 Blender 程序化建模 | `scripts/build_drone_assets.py` 重制攻击无人机、隐形侦察机和蜂群母机三个已有模板；四／六旋翼保留独立轴心关节，不新增兵种或改变属性 |
| 阵营原型与科幻模型 | `assets/models/equipment-library.glb` 与 `.blend`；本地 Blender 程序化建模 | `scripts/build_equipment_assets.py`，五种坦克、五种火箭炮、十三种科幻设施、三种原创未来单位，共 26 个模板；不是厂商精确模型 |
| 子午环阵地表 | `assets/meridian-regolith-v2.png`；内置 AI 图像生成工具制作的细颗粒俯视月壤纹理，旧 `v1` 保留 | 2026-10-04 更新；完整提示词见 `assets/asset-prompts.json`；道路、掩体、反应堆和基地由程序及三维模型叠加 |
| 配乐 | `assets/audio/frontline-sequence.m4a`；程序编曲、合成的循环配乐《前线序列》 | `scripts/generate-audio.mjs`，约 74 秒，不使用官方游戏音乐 |
| 战场音效 | `src/audio.js` 中 Web Audio 振荡器、噪声与滤波合成 | 修改频率、包络和滤波参数 |
| 中文应答 | `src/audio-data.js` 中 37 条原创台词，包含部队与基地受袭警报 | 优先使用设备中文 Speech Synthesis，不分发系统语音录音 |
| 离线兜底播报 | `assets/audio/portable/*.wav` 与 `manifest.json` | `scripts/generate-portable-voices.mjs` 使用 eSpeak NG 1.52.0 合成原创台词；缺少中文音色或播报失败时使用。声音为机械合成，不分发 eSpeak NG 引擎、库、词典或第三方声音模型 |
| 海空运输模型 | `assets/models/logistics-library.glb` / `.blend` | `scripts/build_logistics_assets.py` 原创建模，登陆舰、轰炸机、运输机；为通用游戏模型，不冒充某现役型号的精密复刻 |
| 后勤与舰队模型 | `assets/models/convoy-library.glb` / `.blend` | `scripts/build_convoy_assets.py` 原创程序建模：后勤中心、补给运输机、集装箱船、052D 简化外形、重制航母，共五个模板；公开外形参考，不含现实参数与厂商网格 |
| 月表机器人模型 | `assets/models/robot-library.glb` / `.blend` | `scripts/build_robot_assets.py` 原创程序建模：月卫、天工、巡星三类机体；封闭机舱、电池背包、机械关节、工具／传感器和双腿步态，不是官方南天门 IP 模型或现实装备复刻 |
| 机器人展示图 | `docs/images/lunar-robot*.png` 与 `robot-*-model.png` | 前者为 `scripts/verify-robots-browser.js` 布置的桌面游戏验收场景；后者由 `scripts/render-robot-models.py` 渲染实际 `.blend` 源模型，不是游戏截图 |
| 游戏截图 | `docs/images/`；本项目浏览器运行截图 | 海军集中展示、密集编队及手机版截图来自渲染验证场景，不是预渲染宣传图 |
| 国庆公众号图文素材 | `docs/wechat-national-day-20261002/images/`；六张桌面实机截图、四张现有模型离线渲染、两张 AI 规划概念图 | 正文逐图标注类别；`生成记录.json` 保存内置图像生成工具模式与完整提示词，`scripts/render-article-models.py` 保留模型渲染流程；概念图不是已实现功能或现实装备精确复刻 |
| 补给运输公众号素材 | `docs/wechat-logistics-20261006/images/`；十张桌面游戏界面截图、三张新增源模型摄影棚渲染 | 功能截图安排验证场景但使用实际战局规则；模型图使用 `scripts/render-logistics-models.py`，不是概念图或游戏截图；文章开头感谢 CAI 试玩反馈 |
| 港口后勤公众号素材 | `docs/wechat-fleet-20261006/images/`；七张桌面功能验收截图、三张源模型摄影棚渲染 | 实机截图由 `scripts/verify-convoy-browser.js` 按实际规则布置；源模型图由 `scripts/render-convoy-models.py` 渲染并明确标注，不冒充实机画面 |

本仓库中由作者提供的代码、文档、模型、图片及程序合成配乐，均在作者可授予的权利范围内按根目录 MIT 许可提供。AI 生成图片的可保护性、独占性及第三方权利不作保证；商业使用者应独立核验素材与品牌使用风险。第三方依赖不因本项目许可证而改变其原有许可。

## 不纳入公开分发的录音

早期本地版本用 macOS `say` 生成过中文录音。Apple 的系统语音许可包含公开分享及再分发限制，因此这些录音被 `.gitignore` 排除，公开仓库和公开试玩包不包含它们。旧本地 ZIP 仍可能包含录音，不应作为开源版上传或转发。

参考：[Apple macOS 软件许可协议，第 2.F 节](https://www.apple.com/legal/sla/docs/macOSSequoia.pdf)。具体设备应核对适用版本及所用语音服务的条款。`generate-audio.mjs` 默认只重新生成配乐，`--personal-voices` 仅用于受许可约束的本地个人试验。

## 第三方

eSpeak NG 是生成声音的构建工具，不是随游戏分发的运行依赖。使用其内置普通话音色生成原创台词，不采用许可不明确的第三方神经声音模型。生成器许可与输出的区别参考 [eSpeak 官方许可说明](https://espeak.sourceforge.net/license.html)；将来替换音色或分发引擎前需重新核对许可。

Three.js、PathFinding.js 及 heap.js 使用 MIT 许可；Lucide 使用 ISC 许可，部分继承自 Feather 的图标另有 MIT 声明。原始授权文本见 `THIRD-PARTY-NOTICES.txt`。开发工具及其他间接依赖的许可应同时查看其各自 npm 包；本文件不是对所有未来依赖的授权保证。
