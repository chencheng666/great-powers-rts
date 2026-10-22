"""国内独立实例首次部署：保留简历站和证书，仅增加本项目路径。"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

BASE = Path('/opt/great-powers')
SITE = Path('/www/wwwroot/daguojueqi.site')
EXT = Path('/www/server/panel/vhost/nginx/extension/www.daguojueqi.site/20-great-powers.conf')
NGINX = '/www/server/nginx/sbin/nginx'
ORIGIN = 'https://www.daguojueqi.site'
SERVICES = ['great-powers-domestic', 'great-powers-domestic-six']


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def health(port, version, players):
    for _ in range(30):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=2) as r:
                value = json.load(r)
            if value['version'] == version and value['maxPlayers'] == players:
                return value
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise RuntimeError('服务未通过健康检查')


def deploy(archive, expected):
    if os.geteuid() != 0 or not SITE.joinpath('index.html').is_file():
        raise RuntimeError('仅允许目标国内实例的管理员执行')
    if not re.fullmatch(r'[a-f0-9]{64}', expected) or hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise RuntimeError('发布包校验失败')
    if BASE.joinpath('current').exists() or EXT.exists():
        raise RuntimeError('首次部署脚本不覆盖已有游戏，请走增量发布流程')
    stamp = time.strftime('%Y%m%d-%H%M%S')
    backup = BASE / 'backups' / ('domestic-' + stamp)
    backup.mkdir(parents=True)
    shutil.copytree(SITE, backup / 'resume-original')
    config = Path('/www/server/panel/vhost/nginx/html_www.daguojueqi.site.conf')
    shutil.copy2(config, backup / 'site.conf')
    release = BASE / 'releases' / stamp
    release.mkdir(parents=True)
    with tarfile.open(archive) as package:
        for item in package.getmembers():
            if item.name.startswith('/') or '..' in Path(item.name).parts or not (item.isfile() or item.isdir()):
                raise RuntimeError('发布包包含不安全路径')
        if sys.version_info >= (3, 12):
            package.extractall(release, filter='data')
        else:
            package.extractall(release)
    version = json.loads((release / 'package.json').read_text())['version']
    if not re.fullmatch(r'1\.\d+\.\d+', version):
        raise RuntimeError('发布版本无效')
    for file in ['dist/index.html', 'dist/official/index.html', f'dist/downloads/packages/Great-Powers-RTS-v{version}.zip']:
        if not (release / file).is_file():
            raise RuntimeError('发布包缺少必需文件：' + file)
    env = {**os.environ, 'PATH': str(BASE / 'runtime/bin') + ':' + os.environ['PATH']}
    run(str(BASE / 'runtime/bin/npm'), 'ci', '--omit=dev', '--ignore-scripts', '--registry=https://registry.npmmirror.com', cwd=release, env=env)
    if subprocess.run(['id', 'great-powers'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run('useradd', '--system', '--home-dir', '/var/lib/great-powers-domestic', '--shell', '/sbin/nologin', 'great-powers')
    resume = BASE / 'resume'
    shutil.copytree(SITE, resume)
    index = resume / 'index.html'
    html = index.read_text()
    for asset in ['style.css', 'site.js', 'favicon.svg']:
        html = html.replace('="/' + asset + '"', '="/resume/' + asset + '"')
    index.write_text(html)
    # 游戏和旧站互不覆盖，账户库不跟随前端目录切换。
    for service, port, players, key in zip(SERVICES, [8088, 8089], [2, 6], ['main', 'six']):
        directory = Path('/var/lib/great-powers-domestic') / key
        directory.mkdir(parents=True)
        run('chown', 'great-powers:great-powers', str(directory))
        directory.chmod(0o700)
        unit = f'''[Unit]
Description=大国崛起国内{players}人对战
After=network.target
[Service]
User=great-powers
Group=great-powers
WorkingDirectory=/opt/great-powers/current
ExecStart=/opt/great-powers/runtime/bin/node server/index.mjs
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT={port}
Environment=MAX_PLAYERS={players}
Environment=PUBLIC_ORIGIN={ORIGIN}
Environment=PUBLIC_ORIGINS=https://daguojueqi.site
Environment=DATA_DIRECTORY={directory}
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={directory}
UMask=0077
[Install]
WantedBy=multi-user.target
'''
        Path('/etc/systemd/system/' + service + '.service').write_text(unit)
    BASE.joinpath('current').symlink_to(release)
    run('systemctl', 'daemon-reload')
    try:
        run('systemctl', 'enable', '--now', *SERVICES)
        report = [health(8088, version, 2), health(8089, version, 6)]
        headers = '''proxy_http_version 1.1;
proxy_cache off;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_read_timeout 120s;
'''
        locations = [f'location = / {{ {headers} proxy_pass http://127.0.0.1:8088/official/; }}',
                     'location = /play { return 302 /play/; }',
                     'location = /resume { return 302 /resume/; }',
                     'location = /candidate { return 302 /candidate/; }',
                     'location = /downloads { return 302 /downloads/; }',
                     'location ^~ /resume/ { root /opt/great-powers; index index.html; }']
        for path in ['/official/', '/downloads/', '/assets/', '/api/']:
            locations.append(f'location ^~ {path} {{ {headers} proxy_pass http://127.0.0.1:8088; }}')
        locations.append(f'location = /downloads/manifest.json {{ {headers} proxy_hide_header Cache-Control; add_header Cache-Control "no-store" always; add_header Strict-Transport-Security "max-age=31536000" always; proxy_pass http://127.0.0.1:8088; }}')
        locations.append(f'location ^~ /play/ {{ {headers} proxy_pass http://127.0.0.1:8088/; }}')
        upgrade = 'proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_buffering off;'
        locations.append(f'location = /battle-socket {{ {headers} {upgrade} proxy_pass http://127.0.0.1:8088; }}')
        locations.append(f'location ^~ /candidate/ {{ {headers} {upgrade} proxy_pass http://127.0.0.1:8089/; }}')
        EXT.parent.mkdir(parents=True, exist_ok=True)
        EXT.write_text('# 游戏独立路由，不修改原站证书和文件\n' + '\n'.join(locations) + '\n')
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        result = {'version': version, 'release': str(release), 'backup': str(backup), 'health': report, 'sha256': expected}
        (BASE / 'domestic-release.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        EXT.unlink(missing_ok=True)
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        subprocess.run(['systemctl', 'stop', *SERVICES])
        BASE.joinpath('current').unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    with open(BASE / 'domestic-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(Path(sys.argv[1]).resolve(), sys.argv[2])
