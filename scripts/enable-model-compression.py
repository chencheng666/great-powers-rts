"""为国内站模型响应启用 gzip，先备份并验证 Nginx，异常时恢复。"""
from pathlib import Path
import subprocess

CONFIG = Path('/www/server/panel/vhost/nginx/extension/www.daguojueqi.site/20-great-powers.conf')
BACKUP = Path('/opt/great-powers/frontend-backups/v200-coldstart-beian-20261024/20-great-powers.conf')
NGINX = '/www/server/nginx/sbin/nginx'
MARKER = 'location ^~ /assets/ {'


def main():
    original = CONFIG.read_text()
    if original.count(MARKER) != 1 or BACKUP.exists() or not BACKUP.parent.is_dir():
        raise RuntimeError('配置或备份条件不符合预期，停止修改')
    # 仅调整静态资源路径，模型原文件及范围下载继续保留。
    updated = original.replace(MARKER, MARKER + '\n gzip on; gzip_types model/gltf-binary application/javascript text/javascript text/css application/json; gzip_comp_level 5; gzip_min_length 1024; gzip_vary on; gzip_proxied any;\n', 1)
    BACKUP.write_text(original)
    try:
        CONFIG.write_text(updated)
        subprocess.run([NGINX, '-t'], check=True)
        subprocess.run([NGINX, '-s', 'reload'], check=True)
    except Exception:
        CONFIG.write_text(original)
        subprocess.run([NGINX, '-t'], check=True)
        subprocess.run([NGINX, '-s', 'reload'], check=True)
        raise
    print('模型 gzip 配置生效，原配置备份：' + str(BACKUP))


if __name__ == '__main__':
    main()
