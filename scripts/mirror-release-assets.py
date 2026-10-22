"""校验官方发行资产后建立国内镜像，不接收 GitHub 账户凭据。"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import urllib.parse

BASE = Path('/opt/great-powers')
REPORT = BASE / 'native-mirror-report.json'
LOCK = threading.Lock()


def main(source):
    os.umask(0o077)
    release = (BASE / 'current').resolve()
    manifest_path = release / 'dist/downloads/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    version = manifest['version']
    if not re.fullmatch(r'1\.\d+\.\d+', version):
        raise ValueError('版本无效')
    items = json.loads(source.read_text())
    if len(items) != 9 or len({i['name'] for i in items}) != 9:
        raise ValueError('必须一次提供完整九个桌面资产')
    for item in items:
        if not re.fullmatch(r'Great\.Powers_' + re.escape(version) + r'_[A-Za-z0-9_.-]+', item['name']):
            raise ValueError('文件名不匹配本版')
        url = urllib.parse.urlparse(item['url'])
        if url.scheme != 'https' or url.hostname != 'release-assets.githubusercontent.com':
            raise ValueError('只能下载 GitHub 官方发行资产')
        if not re.fullmatch(r'[a-f0-9]{64}', item['sha256']) or not 0 < item['size'] <= 400 * 1024 * 1024:
            raise ValueError('资产校验信息无效')
    packages = BASE / 'downloads/packages'
    packages.mkdir(parents=True, exist_ok=True)
    current = release / 'dist/downloads/packages'
    if not current.is_symlink():
        for file in current.iterdir():
            if file.is_file():
                shutil.copy2(file, packages / file.name)
        current.rename(current.with_name('packages.initial'))
        current.symlink_to(packages)
    target = packages / ('v' + version)
    target.mkdir(exist_ok=True)
    # 静态下载文件对服务用户可读，但传入的短期下载地址仅留在私有目录。
    packages.chmod(0o755)
    packages.parent.chmod(0o755)
    target.chmod(0o755)
    report = {'version': version, 'complete': False, 'files': []}

    def save_report():
        temp = REPORT.with_suffix('.tmp')
        temp.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        temp.replace(REPORT)

    def download(item):
        destination = target / item['name']
        temp = destination.with_suffix(destination.suffix + '.incoming')
        def file_hash(path):
            digest = hashlib.sha256()
            with open(path, 'rb') as file:
                for block in iter(lambda: file.read(1024 * 1024), b''):
                    digest.update(block)
            return digest.hexdigest()
        try:
            valid = destination.exists() and destination.stat().st_size == item['size'] and file_hash(destination) == item['sha256']
            if not valid:
                # 大文件允许断点续传，网络抖动不丢弃已经下载的部分。
                subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '20', '--max-time', '600', '--retry', '3', '--retry-delay', '2', '--retry-max-time', '600', '--retry-all-errors', '--continue-at', '-', '--output', str(temp), item['url']], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if temp.stat().st_size != item['size'] or file_hash(temp) != item['sha256']:
                    temp.unlink(missing_ok=True)
                    raise ValueError('文件不完整或 SHA256 不匹配')
                temp.chmod(0o644)
                temp.replace(destination)
            if destination.stat().st_size != item['size']:
                raise ValueError('文件不完整或 SHA256 不匹配')
            with LOCK:
                report['files'].append({'name': item['name'], 'size': item['size'], 'sha256': item['sha256'], 'verified': True})
                save_report()
        except Exception as error:
            with LOCK:
                report.setdefault('errors', []).append({'name': item['name'], 'error': type(error).__name__})
                save_report()
            raise RuntimeError('资产下载未通过校验：' + item['name']) from None

    try:
        save_report()
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(download, items))
        manifest = json.loads(manifest_path.read_text())
        by_name = {i['name']: i for i in items}
        offline = next(f for f in manifest['files'] if f['name'] == f'packages/Great-Powers-RTS-v{version}.zip')
        files = [offline]
        for file in manifest['files']:
            name = urllib.parse.unquote(urllib.parse.urlparse(file['name']).path).rsplit('/', 1)[-1]
            if name not in by_name:
                continue
            item = by_name.pop(name)
            if file['size'] != item['size'] or file['sha256'] != item['sha256']:
                raise ValueError('清单与官方资产不一致')
            files.append({**file, 'name': f'packages/v{version}/{name}', 'status': 'CI构建通过；国内镜像已校验大小和SHA256。Mac未公证、Windows未签名，各系统具体硬件仍需实测。'})
        if by_name or len(files) != 10:
            raise ValueError('清单遗漏桌面资产')
        manifest['files'] = files
        manifest['archiveTags'] = []
        temp = manifest_path.with_suffix('.tmp')
        temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        temp.chmod(0o644)
        temp.replace(manifest_path)
        report['complete'] = True
        save_report()
    finally:
        source.unlink(missing_ok=True)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
