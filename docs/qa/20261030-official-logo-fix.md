# 官网页头裂图修复验收

日期：2026年10月30日。功能提交：5458aba。

## 原因与处理

- 原SVG响应为200，但Content-Type为application/octet-stream，浏览器实际解码失败，naturalWidth为0；不能用HTTP200代替图片加载验收。
- 页头改用180px PNG，favicon改用32px PNG，触屏图标沿用180px PNG。静态HTML和运行时JS均使用同一PNG资源，避免脚本重新指向SVG。
- 源码静态服务增加image/svg+xml映射，并加入真实HTTP GET/HEAD回归测试。此次线上采用静态页面修复，不依赖旧服务进程加载新的SVG类型映射；不为图标重启对战进程。

## 验收

- 正式构建通过，全量592项测试通过，0失败。
- 公网品牌图decode成功，naturalWidth为180；favicon解码成功，naturalWidth为32。两资源响应均为200、image/png。
- 公网全部9张页面图片逐一用Image.decode检查成功。
- 390px窄屏文档宽度390，品牌图正常；桌面与窄屏截图均目视检查通过。
- 公网HTML SHA256与本地构建一致：c336609db98e5c448fd00ad0575075dd4de978de33cd3e668e33721b0a43e22e。
- 双人与六方公网健康接口均ok、房间0、对局0。

## 发布

- 发布编号：20261030-official-logo-fix。
- 包SHA256：a7c498e9beb45141e71c04676a558eebe60b860005aa0507344412fd781957c7。
- 使用原静态更新脚本，保留旧资源及数据库，不重启服务。官网实际内容及图片解码已核验。
- OrcaTerm终端画布在后续操作中未持续刷新，未将其旧截图作为发布完成证据；最终结论以公网HTML哈希、PNG响应与浏览器解码结果为准。
