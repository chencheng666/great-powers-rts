import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('原版发布继承独立科幻入口和线上九级统计模块，不替换本次原版服务代码',()=>{
  const script=fileURLToPath(new URL('../scripts/deploy-strategic-release.py',import.meta.url));
  execFileSync('python3',['-c',`
import importlib.util,pathlib,tempfile
spec=importlib.util.spec_from_file_location("deployment",${JSON.stringify(script)})
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp);old=root/"old";new=root/"new"
 for directory in [old/"server",new/"server",old/"dist/starport"]:directory.mkdir(parents=True)
 (old/"dist/starport/index.html").write_text("独立科幻版")
 (old/"server/jiuji-analytics.mjs").write_text("线上统计模块")
 (old/"server/jiuji-site-traffic.mjs").write_text("线上新增访问统计")
 (new/"server/jiuji-analytics.mjs").write_text("发行包旧统计模块")
 (old/"server/index.mjs").write_text("旧原版服务")
 (new/"server/index.mjs").write_text("本次原版服务")
 module.inherit_frozen_channel(old,new)
 assert (new/"dist/starport/index.html").read_text()=="独立科幻版"
 assert (new/"server/jiuji-analytics.mjs").read_text()=="线上统计模块"
 assert (new/"server/jiuji-site-traffic.mjs").read_text()=="线上新增访问统计"
 assert (new/"server/index.mjs").read_text()=="本次原版服务"
`]);
});
