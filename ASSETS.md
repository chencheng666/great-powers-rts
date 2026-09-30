# 素材来源与授权范围

本项目是原创、非官方的即时战略试玩游戏，不隶属于《红色警戒》的权利人，也不是官方续作。红色警戒名称及相关商标的权利归其各自权利人；本项目不授予这些商标、官方游戏素材或配音的使用权。

## 项目素材

| 素材 | 文件与来源 | 编辑方式 |
| --- | --- | --- |
| 地表、建筑、植被 | `assets/terrain-valley-v2.png`、`buildings-realistic-v2.png`、`foliage-realistic-v2.png`、`armory-v1.png`；使用 AI 图像生成工具制作 | 复现提示词见 `assets/asset-prompts.json`，建筑和植被使用透明图集 |
| 开场画面 | `assets/battlefield-key-art.png`；AI 生成的原创战场插画 | 不代表实际运行画质，游戏截图位于 `docs/images/` |
| 军事模型 | `assets/models/military-library.glb` 与 `modern-library.glb`；本地 Blender 程序化建模 | 包含 `.blend` 源文件及 `scripts/build_*_assets.py` 生成脚本，共 34 类基础模型模板与 9 类现代单位模板 |
| 配乐 | `assets/audio/frontline-sequence.m4a`；程序编曲、合成的循环配乐《前线序列》 | `scripts/generate-audio.mjs`，约 74 秒，不使用官方游戏音乐 |
| 战场音效 | `src/audio.js` 中 Web Audio 振荡器、噪声与滤波合成 | 修改频率、包络和滤波参数 |
| 中文应答 | `src/audio-data.js` 中 36 条台词 | 公开版由玩家设备通过 Speech Synthesis 实时播报；中文音色和离线可用性取决于设备，不分发语音引擎或系统录音 |
| 游戏截图 | `docs/images/`；本项目浏览器运行截图 | 海军集中展示、密集编队及手机版截图来自渲染验证场景，不是预渲染宣传图 |

本仓库中由作者提供的代码、文档、模型、图片及程序合成配乐，均在作者可授予的权利范围内按根目录 MIT 许可提供。AI 生成图片的可保护性、独占性及第三方权利不作保证；商业使用者应独立核验素材与品牌使用风险。第三方依赖不因本项目许可证而改变其原有许可。

## 不纳入公开分发的录音

早期本地版本用 macOS `say` 生成过中文录音。Apple 的系统语音许可包含公开分享及再分发限制，因此这些录音被 `.gitignore` 排除，公开仓库和公开试玩包不包含它们。旧本地 ZIP 仍可能包含录音，不应作为开源版上传或转发。

参考：[Apple macOS 软件许可协议，第 2.F 节](https://www.apple.com/legal/sla/docs/macOSSequoia.pdf)。具体设备应核对适用版本及所用语音服务的条款。`generate-audio.mjs` 默认只重新生成配乐，`--personal-voices` 仅用于受许可约束的本地个人试验。

## 第三方

Three.js、PathFinding.js 及 heap.js 使用 MIT 许可；Lucide 使用 ISC 许可，部分继承自 Feather 的图标另有 MIT 声明。原始授权文本见 `THIRD-PARTY-NOTICES.txt`。开发工具及其他间接依赖的许可应同时查看其各自 npm 包；本文件不是对所有未来依赖的授权保证。
