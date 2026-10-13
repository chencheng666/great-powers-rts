#!/usr/bin/env python3
"""既有硅谷节点升级：先备份双人数据，再增加隔离六方服务与切换官网。"""
import argparse,hashlib,json,os,pathlib,shutil,subprocess,time,urllib.request

BASE=pathlib.Path('/opt/great-powers')
CONFIG=pathlib.Path('/etc/nginx/great-powers.conf')
UNIT=pathlib.Path('/etc/systemd/system/great-powers-six-candidate.service')
ORIGIN='https://43.135.186.21:8443'

def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stdout

def atomic(path,data):
    temp=path.with_name(path.name+'.v100-next');temp.write_bytes(data);os.replace(temp,path)

def link(path,target):
    temp=path.with_name(path.name+'.v100-next');temp.symlink_to(target);os.replace(temp,path)

def health(port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=5) as response:
        return json.load(response)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('archive');parser.add_argument('sha256');parser.add_argument('release');parser.add_argument('--updater');args=parser.parse_args()
    if not args.release.replace('-','').isalnum():raise RuntimeError('发布编号无效')
    archive=pathlib.Path(args.archive)
    if hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=args.sha256:raise RuntimeError('包校验失败')
    if UNIT.exists() or (BASE/'candidate-current').exists():raise RuntimeError('已有六方部署，需人工核验后更新')
    if (BASE/'candidate-data').exists():raise RuntimeError('已有候选数据目录，禁止覆盖未知数据')
    before=CONFIG.read_bytes();text=before.decode();anchor=' location / {\n'
    if text.count(anchor)!=1 or '/candidate/' in text:raise RuntimeError('Nginx基线不匹配')
    if health(8088).get('rooms') or health(8088).get('battles'):raise RuntimeError('有玩家房间，暂不升级')
    old_game=(BASE/'current').resolve();old_official=(BASE/'official/current').resolve()
    backup=BASE/'backups'/args.release
    if backup.exists():raise RuntimeError('备份编号已存在')
    # 既有更新器在停服后备份完整SQLite目录，失败恢复旧双人服务。
    print(run(['bash',args.updater or str(pathlib.Path(__file__).with_name('deploy-server-update.sh')),str(archive),args.sha256,args.release]))
    stage=BASE/'releases'/args.release
    (backup/'nginx-before.conf').write_bytes(before)
    (backup/'official-before.txt').write_text(str(old_official))
    candidate_data=BASE/'candidate-data'
    created_unit=False
    try:
        if CONFIG.read_bytes()!=before:raise RuntimeError('部署中配置发生变化，停止')
        candidate_data.mkdir(mode=0o750);run(['chown','great-powers:great-powers',str(candidate_data)])
        link(BASE/'candidate-current',stage)
        unit=f'''[Unit]
Description=Great Powers Six Player Experimental Server
After=network.target
[Service]
User=great-powers
Group=great-powers
WorkingDirectory={BASE}/candidate-current
ExecStart={BASE}/runtime/bin/node server/index.mjs
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=320
Environment=HOST=127.0.0.1
Environment=PORT=8089
Environment=MAX_PLAYERS=6
Environment=PUBLIC_ORIGIN={ORIGIN}
Environment=DATA_DIRECTORY={candidate_data}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={candidate_data}
MemoryMax=512M
CPUQuota=80%
TasksMax=64
[Install]
WantedBy=multi-user.target
'''
        atomic(UNIT,unit.encode());created_unit=True
        run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','great-powers-six-candidate'])
        for attempt in range(20):
            try:
                h=health(8089)
                if h.get('ok') and h.get('protocol')==3 and h.get('version')=='1.0.0':break
            except Exception:pass
            time.sleep(1)
        else:raise RuntimeError('六方服务启动验收失败')
        route=''' location = /candidate { return 302 /candidate/; }
 location /candidate/ {
  proxy_pass http://127.0.0.1:8089/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $gp_connection_upgrade;
  proxy_read_timeout 120s;
  proxy_send_timeout 120s;
  proxy_buffering off;
 }
'''
        candidate=text.replace(anchor,route+anchor).encode();test_config=backup/'nginx-v100.conf';test_config.write_bytes(candidate)
        run(['nginx','-t','-c',str(test_config)])
        if not (stage/'dist/official/assets/v1-six-battle.png').is_file():raise RuntimeError('缺少官网实机素材')
        link(BASE/'official/current',stage/'dist/official');atomic(CONFIG,candidate)
        run(['nginx','-t','-c',str(CONFIG)]);run(['nginx','-s','reload','-c',str(CONFIG)])
        report={'version':'1.0.0','game':health(8088),'six':health(8089),'oldGame':str(old_game),'oldOfficial':str(old_official),'nginxSha256':hashlib.sha256(candidate).hexdigest(),'backup':str(backup)}
        if report['game'].get('protocol')!=2 or report['game'].get('version')!='1.0.0':raise RuntimeError('双人版本检查失败')
        (backup/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
    except Exception:
        atomic(CONFIG,before);link(BASE/'official/current',old_official)
        run(['nginx','-t','-c',str(CONFIG)]);run(['nginx','-s','reload','-c',str(CONFIG)])
        if created_unit:
            run(['systemctl','disable','--now','great-powers-six-candidate']);UNIT.unlink();run(['systemctl','daemon-reload'])
        (BASE/'candidate-current').unlink(missing_ok=True)
        link(BASE/'current',old_game);run(['systemctl','restart','great-powers'])
        # 不将旧数据库覆盖回现库；候选数据与发布目录保留以便诊断。
        raise

if __name__=='__main__':main()
