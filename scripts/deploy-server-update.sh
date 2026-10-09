#!/usr/bin/env bash
set -euo pipefail
# 更新既有服务，保留运行时、服务配置和数据；仅在无房间时短暂停服备份。
archive="${1:?请提供服务发布包}"
expected="${2:?请提供发布包 SHA256}"
release="${3:?请提供发布编号}"
[[ "$release" =~ ^[0-9A-Za-z-]+$ ]]
base=/opt/great-powers
node="$base/runtime/bin/node"
stage="$base/releases/$release"
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* && -x "$node" && ! -e "$stage" ]]
exec 9>"$base/deploy.lock"
flock -n 9
systemctl is-active --quiet great-powers
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
idle() {
  curl --fail --silent http://127.0.0.1:8088/api/health | "$node" -e '
    let text="";process.stdin.on("data",v=>text+=v);process.stdin.on("end",()=>{
      const h=JSON.parse(text);if(!h.ok||h.rooms||h.battles){console.error("有房间或对战，停止更新");process.exit(1);}
    });'
}
idle
install -d "$stage"
tar -xzf "$archive" -C "$stage"
cd "$stage"
[[ -f dist/index.html && -f server/index.mjs && -f package-lock.json ]]
PATH="$base/runtime/bin:$PATH" npm ci --omit=dev --ignore-scripts
# 留存旧哈希资源，避免已有页面的媒体请求因切换目录而失效。
for file in "$previous/dist/assets/"*; do
  [[ -f "$file" ]] || continue
  if [[ ! -e "$stage/dist/assets/${file##*/}" ]]; then
    cp -p "$file" "$stage/dist/assets/${file##*/}"
  fi
done
"$node" --input-type=module <<'JS'
import { createBattleServer } from './server/index.mjs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'gp-update-check-'));
const {server}=createBattleServer({directory,root:resolve('dist'),origin:'http://127.0.0.1',dev:false});
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  const h=await (await fetch(`${url}/api/health`)).json();
  if(!h.ok)throw new Error('新服务预检失败');
  if(await (await fetch(url)).text()!==await readFile('dist/index.html','utf8'))throw new Error('新页面预检失败');
  console.log('新网页与对战服务预检通过');
} finally {
  await new Promise(r=>server.close(r));
  await rm(directory,{recursive:true,force:true});
}
JS
idle
backup="$base/backups/$release"
[[ ! -e "$backup" ]]
install -d -m 700 "$backup"
stopped=false
switched=false
finish() {
  result=$?
  if [[ "$result" != 0 && ( "$stopped" == true || "$switched" == true ) ]]; then
    ln -s "$previous" "$base/current.rollback-$release"
    mv -Tf "$base/current.rollback-$release" "$base/current"
    systemctl restart great-powers
    printf '更新失败，已恢复旧版服务；数据备份：%s\n' "$backup"
  fi
  exit "$result"
}
trap finish EXIT
printf '%s\n' "$previous" >"$backup/previous-release.txt"
systemctl cat great-powers >"$backup/service.txt"
stopped=true
systemctl stop great-powers
cp -a /var/lib/great-powers "$backup/data"
"$node" --input-type=module - "$backup/data/guests.sqlite" <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.argv[2],{readOnly:true});
if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('备份完整性检查失败');
const result={guests:db.prepare('SELECT COUNT(*) AS n FROM guests').get().n,matches:db.prepare('SELECT COUNT(*) AS n FROM matches').get().n};
console.log('备份战绩计数',JSON.stringify(result));
db.close();
JS
ln -s "$stage" "$base/current.next-$release"
mv -Tf "$base/current.next-$release" "$base/current"
switched=true
systemctl start great-powers
stopped=false
healthy=false
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:8088/api/health; then healthy=true; break; fi
  sleep 1
done
[[ "$healthy" == true ]]
curl --fail --silent http://127.0.0.1:8088/ | cmp - "$stage/dist/index.html"
"$node" --input-type=module - "$backup/data/guests.sqlite" /var/lib/great-powers/guests.sqlite <<'JS'
import {DatabaseSync} from 'node:sqlite';
const queries=['SELECT COUNT(*) AS n FROM guests','SELECT COUNT(*) AS n FROM matches','SELECT COALESCE(SUM(wins+losses+draws),0) AS n FROM guests'];
const databases=process.argv.slice(2).map(p=>new DatabaseSync(p,{readOnly:true}));
try {for(const sql of queries)if(databases[1].prepare(sql).get().n<databases[0].prepare(sql).get().n)throw new Error('历史数据计数减少');}
finally {databases.forEach(db=>db.close());}
console.log('历史战绩保留检查通过');
JS
printf '\n服务发布成功：%s；备份：%s\n' "$release" "$backup"
systemctl show great-powers --property=MainPID,ActiveState,User
