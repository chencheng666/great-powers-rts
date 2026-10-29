#!/usr/bin/env python3
"""只替换九级统计相关文件；复制当前发布目录，保护并行开发与历史数据。"""
import argparse, fcntl, hashlib, json, os, pathlib, shutil, subprocess, tarfile, time, urllib.request
BASE = pathlib.Path('/opt/great-powers')
SERVICES = ['great-powers-domestic', 'great-powers-domestic-six']
ALLOWED = {'server/index.mjs', 'server/player-analytics.mjs', 'server/jiuji-analytics.mjs', 'dist/admin/index.html', 'dist/admin/admin.js'}
DATA = [pathlib.Path('/var/lib/great-powers-domestic') / x for x in ['main', 'six']]
def run(args, **kw):
    p = subprocess.run(args, capture_output=True, text=True, **kw)
    if p.returncode: raise RuntimeError(p.stderr or p.stdout)
    return p.stdout
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def health():
    return [json.load(urllib.request.urlopen(f'http://127.0.0.1:{p}/api/health', timeout=5)) for p in [8088,8089]]
def idle():
    rows=health()
    if any(not h.get('ok') or h.get('rooms') or h.get('battles') for h in rows): raise RuntimeError('有房间或战斗，停止本次更新')
    return rows
def link(target):
    temp=BASE/'current-jiuji-next'
    if temp.exists() or temp.is_symlink(): raise RuntimeError('存在未完成的发布链接')
    temp.symlink_to(target); os.replace(temp,BASE/'current')
def db_counts(node):
    script="""import{DatabaseSync}from'node:sqlite';import{existsSync}from'node:fs';const out=[];for(const p of process.argv.slice(1)){if(!existsSync(p)){out.push(null);continue;}const db=new DatabaseSync(p,{readOnly:true});if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('数据库完整性异常');const row={};for(const{name}of db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").all())row[name]=db.prepare('SELECT count(*) n FROM \"'+name.replaceAll('\"','\"\"')+'\"').get().n;out.push(row);db.close();}console.log(JSON.stringify(out));"""
    paths=[str(p / f) for p in DATA for f in ['guests.sqlite','analytics.sqlite']]
    return json.loads(run([str(node),'--input-type=module','-e',script,*paths]))
def main():
    p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('sha256');p.add_argument('release');a=p.parse_args()
    if os.geteuid()!=0 or not a.release.startswith('jiuji-analytics-') or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' for c in a.release): raise RuntimeError('目标或编号无效')
    archive=pathlib.Path(a.archive)
    if sha(archive)!=a.sha256: raise RuntimeError('发布包校验失败')
    lock=(BASE/'deploy.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    before_health=idle();previous=(BASE/'current').resolve();stage=BASE/'releases'/a.release;backup=BASE/'backups'/a.release;node=BASE/'runtime/bin/node'
    if not previous.is_relative_to(BASE/'releases') or stage.exists() or backup.exists(): raise RuntimeError('发布目录不符合预期')
    if shutil.disk_usage(BASE).free<1500000000: raise RuntimeError('服务器空间不足')
    with tarfile.open(archive) as tar:
        members=tar.getmembers()
        if any(not m.isfile() or m.name not in ALLOWED|{'patch.json'} for m in members): raise RuntimeError('发布包越界')
        manifest=json.load(tar.extractfile('patch.json'))
        if set(manifest['files'])!=ALLOWED: raise RuntimeError('文件白名单不匹配')
        for name,item in manifest['files'].items():
            old=previous/name
            actual=sha(old) if old.is_file() else None
            if actual!=item['before']: raise RuntimeError('线上文件已经变化，请重新合并：'+name)
            if hashlib.sha256(tar.extractfile(name).read()).hexdigest()!=item['after']: raise RuntimeError('补丁文件校验失败')
        shutil.copytree(previous,stage,symlinks=True)
        for name in ALLOWED:
            dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(tar.extractfile(name).read());dest.chmod(0o644)
    # 保留大国崛起的版本号、网页和下载包，只更新后台文件在资源清单中的哈希。
    release_file=stage/'dist/release.json'
    if release_file.exists():
        release=json.loads(release_file.read_text())
        for name in ['admin/index.html','admin/admin.js']:
            if name in release.get('assets',{}): release['assets'][name]=sha(stage/'dist'/name)
        release_file.write_text(json.dumps(release,ensure_ascii=False,indent=2));release_file.chmod(0o644)
    smoke="""import{createBattleServer}from'./server/index.mjs';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';for(const n of[2,6]){const directory=await mkdtemp(join(tmpdir(),'jiuji-patch-'));const app=createBattleServer({directory,root:resolve('dist'),maxPlayers:n});try{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+app.server.address().port;if((await fetch(root+'/api/admin/status')).status!==401)throw Error('后台鉴权异常');if(!(await(await fetch(root+'/admin/')).text()).includes('game-filter'))throw Error('后台游戏切换缺失');}finally{await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});}}console.log('隔离预检通过');"""
    print(run([str(node),'--input-type=module','-e',smoke],cwd=stage),flush=True)
    idle();backup.mkdir(mode=0o700);(backup/'previous.txt').write_text(str(previous));switched=False;stopped=False
    try:
        run(['systemctl','stop',*SERVICES]);stopped=True
        for i,directory in enumerate(DATA): shutil.copytree(directory,backup/f'data-{i}',symlinks=True)
        before=db_counts(node);link(stage);switched=True;run(['systemctl','start',*SERVICES]);stopped=False
        for _ in range(20):
            try:
                after_health=health()
                if all(h['ok'] and h['build']==b['build'] and h['version']==b['version'] for h,b in zip(after_health,before_health)):break
            except Exception:pass
            time.sleep(1)
        else:raise RuntimeError('原对战服务健康检查未通过')
        after=db_counts(node)
        if any(any(new.get(k,0)<v for k,v in old.items()) for old,new in zip(before,after) if old):raise RuntimeError('原游戏记录减少')
        report={'release':str(stage),'backup':str(backup),'previous':str(previous),'sourceCommit':manifest['sourceCommit'],'health':after_health,'before':before,'after':after,'files':manifest['files']}
        (backup/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)
    except Exception:
        if switched:link(previous)
        if stopped or switched:run(['systemctl','restart',*SERVICES])
        print('已恢复原发布指针与服务，未回写任何数据库。',flush=True);raise
if __name__=='__main__':main()
