#!/usr/bin/env python3
"""在既有国内双节点上发布网页、音效及统计后台，保留账号、战绩和回滚目录。"""
import argparse, fcntl, hashlib, json, os, pathlib, re, shutil, subprocess, tarfile, tempfile, time, urllib.request, urllib.error
BASE = pathlib.Path('/opt/great-powers')
EXT = pathlib.Path('/www/server/panel/vhost/nginx/extension/www.daguojueqi.site/20-great-powers.conf')
NGINX = '/www/server/nginx/sbin/nginx'
SERVICES = ['great-powers-domestic', 'great-powers-domestic-six']
DATA = [pathlib.Path('/var/lib/great-powers-domestic/main'), pathlib.Path('/var/lib/great-powers-domestic/six')]
def run(args, **kwargs):
    p = subprocess.run(args, text=True, capture_output=True, **kwargs)
    if p.returncode: raise RuntimeError(p.stderr or p.stdout or '命令失败')
    return p.stdout

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def health(port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=5) as r: return json.load(r)

def idle():
    for port in [8088, 8089]:
        h = health(port)
        if not h.get('ok') or h.get('rooms') or h.get('battles'): raise RuntimeError('仍有房间或对战，保留现有服务，稍后再发布')

def atomic(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.analytics-tmp')
    with temporary.open('wb') as f: f.write(data)
    temporary.chmod(mode); os.replace(temporary, path)

def link(target):
    p = BASE / 'current-analytics-next'
    if p.exists() or p.is_symlink(): raise RuntimeError('发现其他待切换链接')
    p.symlink_to(target); os.replace(p, BASE / 'current')

def counts(node, paths):
    code = """import{DatabaseSync}from'node:sqlite';const result=[];for(const path of process.argv.slice(1)){const db=new DatabaseSync(path,{readOnly:true});if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('数据库完整性异常');const row={};for(const table of ['guests','matches','multi_matches','match_members'])row[table]=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)?db.prepare('SELECT count(*) n FROM '+table).get().n:0;row.scores=db.prepare('SELECT coalesce(sum(wins+losses+draws),0) n FROM guests').get().n;result.push(row);db.close();}console.log(JSON.stringify(result));"""
    return json.loads(run([str(node), '--input-type=module', '-e', code, *map(str, paths)]))

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('archive'); parser.add_argument('sha256'); parser.add_argument('release'); parser.add_argument('offline_zip'); parser.add_argument('--admin-env', required=True); args = parser.parse_args()
    if os.geteuid() != 0 or not EXT.is_file() or not re.fullmatch(r'[0-9A-Za-z-]+', args.release): raise RuntimeError('目标或发布编号无效')
    archive = pathlib.Path(args.archive)
    if digest(archive) != args.sha256: raise RuntimeError('发布包校验失败')
    lock = (BASE / 'deploy.lock').open('a'); fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    idle()
    if shutil.disk_usage(BASE).free < 1500000000: raise RuntimeError('服务器剩余空间不足')
    previous = (BASE / 'current').resolve(); stage = BASE / 'releases' / args.release; backup = BASE / 'backups' / args.release; node = BASE / 'runtime/bin/node'
    if not str(previous).startswith(str(BASE / 'releases') + '/') or stage.exists() or backup.exists(): raise RuntimeError('发布指针异常或编号已经使用')
    for service in SERVICES: run(['systemctl', 'is-active', '--quiet', service])
    admin_bytes = pathlib.Path(args.admin_env).read_bytes()
    if not re.fullmatch(rb'ADMIN_PASSWORD_HASH=[a-f0-9]{32}:[a-f0-9]{64}\n?', admin_bytes): raise RuntimeError('管理员配置无效')
    # 原包体及依赖直接复制，新文件原子覆盖，绝不修改旧发布目录。
    stage.mkdir()
    for name in ['dist', 'src', 'server', 'node_modules']:
        shutil.copytree(previous / name, stage / name, symlinks=True)
    for name in ['package.json', 'package-lock.json']: shutil.copy2(previous / name, stage / name)
    with tarfile.open(archive) as tar:
        for item in tar.getmembers():
            path = pathlib.PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or not (item.isfile() or item.isdir()): raise RuntimeError('压缩包路径不安全')
            if path.parts[0] not in ['dist', 'src', 'server', 'package.json', 'package-lock.json']: raise RuntimeError('发布内容超出白名单')
            target = stage.joinpath(*path.parts)
            if item.isdir(): target.mkdir(parents=True, exist_ok=True)
            else: atomic(target, tar.extractfile(item).read())
    if digest(stage / 'package-lock.json') != digest(previous / 'package-lock.json'): raise RuntimeError('依赖锁发生变化，不能复用旧依赖')
    manifest = json.loads((stage / 'dist/release.json').read_text())
    for name, expected in manifest['assets'].items():
        file = stage / 'dist' / name
        if not file.is_file() or digest(file) != expected: raise RuntimeError('资源缺失或哈希不一致：' + name)
    download_manifest = json.loads((stage / 'dist/downloads/manifest.json').read_text())
    offline = next(f for f in download_manifest['files'] if pathlib.PurePosixPath(f['name']).name == pathlib.Path(args.offline_zip).name)
    source_zip = pathlib.Path(args.offline_zip)
    if digest(source_zip) != offline['sha256'] or source_zip.stat().st_size != offline['size']: raise RuntimeError('离线包校验失败')
    target_zip = BASE / 'downloads' / offline['name']
    target_zip.parent.mkdir(parents=True, exist_ok=True)
    if target_zip.exists():
        if digest(target_zip) != offline['sha256']: raise RuntimeError('拒绝覆盖同名不同内容的历史下载')
    else: shutil.copy2(source_zip, target_zip); target_zip.chmod(0o644)
    smoke = """import{createBattleServer}from'./server/index.mjs';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';for(const n of[2,6]){const directory=await mkdtemp(join(tmpdir(),'gp-stat-preflight-'));const app=createBattleServer({directory,root:resolve('dist'),maxPlayers:n});try{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+app.server.address().port,h=await(await fetch(root+'/api/health')).json();if(h.build!==process.argv[1]||h.maxPlayers!==n)throw Error('预检失败');if((await fetch(root+'/admin/')).status!==200)throw Error('后台页面缺失');if((await fetch(root+'/api/admin/status')).status!==401)throw Error('后台鉴权异常');}finally{await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});}}console.log('两个服务、后台页面与鉴权预检通过');"""
    print(run([str(node), '--input-type=module', '-e', smoke, manifest['build']], cwd=stage), flush=True)
    idle(); backup.mkdir(mode=0o700)
    (backup / 'previous.txt').write_text(str(previous)); shutil.copy2(EXT, backup / 'nginx-before.conf')
    env_path = pathlib.Path('/etc/great-powers/player-admin.env'); dropin = pathlib.Path('/etc/systemd/system/great-powers-domestic.service.d/30-player-admin.conf')
    old_env = env_path.read_bytes() if env_path.exists() else None; old_dropin = dropin.read_bytes() if dropin.exists() else None
    if old_env is not None and old_env != admin_bytes: raise RuntimeError('已有其他管理员配置，保留现有口令，不自动覆盖')
    stopped = switched = configured = nginx_changed = False
    try:
        stopped = True; run(['systemctl', 'stop', *SERVICES])
        for i, directory in enumerate(DATA): shutil.copytree(directory, backup / f'data-{i}', symlinks=True)
        before = counts(node, [backup / f'data-{i}/guests.sqlite' for i in [0, 1]])
        atomic(env_path, admin_bytes, 0o600); atomic(dropin, b'[Service]\nEnvironmentFile=/etc/great-powers/player-admin.env\n', 0o600); configured = True
        original = EXT.read_text()
        if 'location ^~ /admin/' not in original:
            route = '\nlocation = /admin { return 302 /admin/; }\nlocation ^~ /admin/ { proxy_http_version 1.1; proxy_cache off; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_pass http://127.0.0.1:8088; }\n'
            atomic(EXT, (original + route).encode()); nginx_changed = True; run([NGINX, '-t'])
        link(stage); switched = True; run(['systemctl', 'daemon-reload']); run(['systemctl', 'start', *SERVICES]); stopped = False
        for attempt in range(25):
            try:
                values = [health(p) for p in [8088, 8089]]
                if all(v.get('build') == manifest['build'] for v in values): break
            except Exception: pass
            time.sleep(1)
        else: raise RuntimeError('新服务没有通过健康检查')
        run([NGINX, '-s', 'reload'])
        after = counts(node, [d / 'guests.sqlite' for d in DATA])
        for old, new in zip(before, after):
            if any(new[k] < old[k] for k in old): raise RuntimeError('历史账号或战绩计数减少')
        with urllib.request.urlopen('http://127.0.0.1:8088/admin/', timeout=5) as r:
            if b'admin.js' not in r.read(): raise RuntimeError('后台页面异常')
        report = dict(release=str(stage), backup=str(backup), previous=str(previous), build=manifest['build'], sourceCommit=manifest['sourceCommit'], health=values, before=before, after=after, offlineSha256=offline['sha256'], archiveSha256=args.sha256, adminProtected=True)
        atomic(backup / 'verification.json', json.dumps(report, ensure_ascii=False, indent=2).encode(), 0o600)
        print(json.dumps(report, ensure_ascii=False), flush=True)
    except Exception:
        if switched: link(previous)
        if nginx_changed: shutil.copy2(backup / 'nginx-before.conf', EXT); run([NGINX, '-t']); run([NGINX, '-s', 'reload'])
        if configured:
            if old_env is None: env_path.unlink(missing_ok=True)
            else: atomic(env_path, old_env, 0o600)
            if old_dropin is None: dropin.unlink(missing_ok=True)
            else: atomic(dropin, old_dropin, 0o600)
            run(['systemctl', 'daemon-reload'])
        if stopped or switched: run(['systemctl', 'restart', *SERVICES])
        print('发布未通过，已恢复原发布指针、配置和服务；数据库不回写，备份保留。', flush=True)
        raise
if __name__ == '__main__': main()
