# 战区道具来源与转换

`source.json` 记录20个原始模型、下载来源、作者、文件摘要及许可。仓库保留对应源网格以及发布包中附带的许可资料。Majadroid 的原包说明列有 Imphenzia 色板，游戏转换使用项目重新指定的颜色。3TD 的 CC0 声明见 OpenGameArt 发布页。Kenney 两包来自作者的 OpenGameArt 发布，保留原始 License.txt。

使用 Blender 的后台 Python 执行 `scripts/build-map-scenery.py`。需让 Blender Python 能导入 pycollada，用于读取 DAE；FBX 和 GLB 由 Blender 导入。转换保留形状，移除碰撞网格和重复细节档，统一轴向、接地、比例、颜色和索引。原贴图未进入游戏渲染。

生成的 `src/map-scenery-mesh-data.js` 中，`stoneWall`、`stoneBridge`、`woodBarrels` 三项网格是 Wildfire Games 《0 A.D.》素材的修改版，按 CC BY-SA 3.0 发布。其余改制网格沿用各自记录中的 CC0 1.0。授权说明也随游戏静态资源发布。
