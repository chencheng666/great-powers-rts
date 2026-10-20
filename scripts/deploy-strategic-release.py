#!/usr/bin/env python3
"""双人、六方与官网共同更新；保留战绩、备份与失败回滚。"""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import fcntl
import re

BASE=pathlib.Path('/opt/great-powers')
SERVICES=['great-powers','great-powers-six-candidate']
DATA=[pathlib.Path('/var/lib/great-powers'),BASE/'candidate-data']

def run(args,**kwargs):
    result=subprocess.run(args,capture_output=True,text=True,**kwargs)
    if result.returncode:raise RuntimeError(result.stderr or result.stdout or '子进程执行失败')
    return result.stdout

def health(port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=5) as response:
        return json.load(response)

def idle():
    values=[health(port) for port in [8088,8089]]
    if any(not h.get('ok') or h.get('rooms') or h.get('battles') for h in values):
        raise RuntimeError('已有玩家房间或对局，停止发布，不打断玩家')

def link(path,target):
    temporary=path.with_name(path.name+'.strategic-next')
    if temporary.exists() or temporary.is_symlink():raise RuntimeError('发现其他待切换链接，停止')
    temporary.symlink_to(target);os.replace(temporary,path)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('archive');parser.add_argument('sha256');parser.add_argument('release');args=parser.parse_args()
    if not args.release.replace('-','').isalnum():raise RuntimeError('发布编号无效')
    archive=pathlib.Path(args.archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=args.sha256:raise RuntimeError('发布包校验失败')
    lock=(BASE/'deploy.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    for service in SERVICES:run(['systemctl','is-active','--quiet',service])
    idle()
    if shutil.disk_usage(BASE).free<1_200_000_000:raise RuntimeError('剩余空间不足，保留现有服务')
    stage=BASE/'releases'/args.release;backup=BASE/'backups'/args.release
    if stage.exists() or backup.exists():raise RuntimeError('发布或备份编号已存在，禁止覆盖')
    links={BASE/'current':(BASE/'current').resolve(),BASE/'candidate-current':(BASE/'candidate-current').resolve(),BASE/'official/current':(BASE/'official/current').resolve()}
    if any(not str(p).startswith(str(BASE)+'/') for p in links.values()):raise RuntimeError('旧发布路径不符合预期')
    stage.mkdir()
    with tarfile.open(archive) as tar:
        for item in tar.getmembers():
            if pathlib.PurePosixPath(item.name).is_absolute() or '..' in pathlib.PurePosixPath(item.name).parts or not(item.isfile() or item.isdir()):raise RuntimeError('压缩包包含不安全路径或链接')
        tar.extractall(stage)
    version=json.loads((stage/'package.json').read_text())['version']
    if not re.fullmatch(r'1\.\d+\.\d+',version) or not(stage/'dist/official/index.html').is_file():raise RuntimeError('发布版本或官网文件缺失')
    node=BASE/'runtime/bin/node';env=dict(os.environ,PATH=str(node.parent)+':'+os.environ['PATH'])
    print(run(['npm','ci','--omit=dev','--ignore-scripts','--registry=https://registry.npmjs.org'],cwd=stage,env=env),flush=True)
    for previous in set(links.values()):
        assets=previous/'dist/assets'
        if assets.is_dir():
            for file in assets.iterdir():
                target=stage/'dist/assets'/file.name
                if file.is_file() and not target.exists():shutil.copy2(file,target)
    shared=BASE/'downloads/packages';shared.mkdir(parents=True,exist_ok=True)
    incoming=stage/'dist/downloads/packages'
    if incoming.is_dir():
        for file in incoming.iterdir():
            target=shared/file.name
            if target.exists():
                if hashlib.sha256(file.read_bytes()).digest()!=hashlib.sha256(target.read_bytes()).digest():raise RuntimeError('历史安装包冲突')
            else:shutil.copy2(file,target)
        shutil.rmtree(incoming)
    incoming.symlink_to(shared)
    smoke="""import {createBattleServer} from './server/index.mjs';import {GAME_VERSION}from'./src/version.js';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
for(const count of [2,6]){const d=await mkdtemp(join(tmpdir(),'gp-preflight-')),app=createBattleServer({directory:d,maxPlayers:count,dev:false});try{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const h=await(await fetch('http://127.0.0.1:'+app.server.address().port+'/api/health')).json();if(h.version!==GAME_VERSION||h.maxPlayers!==count||h.protocol!==(count===6?5:4))throw Error('预检失败');console.log('预检通过',JSON.stringify(h));}finally{await new Promise(r=>app.server.close(r));await rm(d,{recursive:true,force:true});}}"""
    print(run([str(node),'--input-type=module','-e',smoke],cwd=stage),flush=True)
    idle();backup.mkdir(mode=0o700)
    (backup/'previous.json').write_text(json.dumps({str(k):str(v) for k,v in links.items()},indent=2))
    stopped=False;switched=False
    try:
        stopped=True;run(['systemctl','stop',*SERVICES])
        for index,path in enumerate(DATA):shutil.copytree(path,backup/f'data-{index}',symlinks=True)
        check="""import{DatabaseSync}from'node:sqlite';for(const path of process.argv.slice(1)){const db=new DatabaseSync(path,{readOnly:true});if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('数据库损坏');console.log(path,JSON.stringify({guests:db.prepare('SELECT count(*) n FROM guests').get().n,matches:db.prepare('SELECT count(*) n FROM matches').get().n}));db.close();}"""
        print(run([str(node),'--input-type=module','-e',check,*[str(backup/f'data-{i}/guests.sqlite') for i in [0,1]]]),flush=True)
        switched=True
        link(BASE/'current',stage);link(BASE/'candidate-current',stage);link(BASE/'official/current',stage/'dist/official')
        run(['systemctl','start',*SERVICES]);stopped=False
        for attempt in range(25):
            try:
                values=[health(p) for p in [8088,8089]]
                if all(h.get('version')==version and h.get('protocol')==protocol for h,protocol in zip(values,[4,5])):break
            except Exception:pass
            time.sleep(1)
        else:raise RuntimeError('新版本健康检查失败')
        for port in [8088,8089]:
            content=urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=5).read()
            if hashlib.sha256(content).digest()!=hashlib.sha256((stage/'dist/index.html').read_bytes()).digest():raise RuntimeError('网页内容不一致')
        for index,path in enumerate(DATA):
            compare="""import{DatabaseSync}from'node:sqlite';const dbs=process.argv.slice(1).map(p=>new DatabaseSync(p,{readOnly:true}));const count=(db,table)=>db.prepare(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name=?\").get(table)?db.prepare('SELECT count(*) n FROM '+table).get().n:0;for(const table of ['guests','matches','multi_matches','match_members'])if(count(dbs[1],table)<count(dbs[0],table))throw Error('历史记录减少：'+table);const sql='SELECT coalesce(sum(wins+losses+draws),0) n FROM guests';if(dbs[1].prepare(sql).get().n<dbs[0].prepare(sql).get().n)throw Error('历史战绩减少');dbs.forEach(d=>d.close());"""
            run([str(node),'--input-type=module','-e',compare,str(backup/f'data-{index}/guests.sqlite'),str(path/'guests.sqlite')])
        report={'version':version,'services':values,'release':str(stage),'backup':str(backup),'sha256':args.sha256}
        (backup/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)
    except Exception:
        if switched:
            for path,target in links.items():link(path,target)
        if stopped or switched:run(['systemctl','restart',*SERVICES])
        print('发布失败，已恢复原链接与服务；不覆盖现库，备份保留。',flush=True)
        raise

if __name__=='__main__':main()
