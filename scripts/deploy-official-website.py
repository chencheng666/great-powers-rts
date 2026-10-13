#!/usr/bin/env python3
"""独立官网准备与部署；默认仅准备，--apply 才切换官网路径并重载 HTTPS nginx。"""
import argparse,hashlib,json,os,pathlib,shutil,subprocess,urllib.request
COMMIT='4742d68fd0240106bf20cd233cffbb8282b7e825'
MANIFEST=[{'path': 'assets/battle-6s.mp4', 'size': 1718123, 'sha256': '75aba8f40d8abe214360908301e372f7c0db222fb2f77974f3dbebf007e7db0d'}, {'path': 'assets/battle.jpg', 'size': 1569691, 'sha256': 'ada8b03e12a68e3032bb646da1962edcd73b5448adc6628ca7a675e807138348'}, {'path': 'assets/lobby.jpg', 'size': 268516, 'sha256': 'c6e3027b78ff8bf10812934b78687524fde2a06f243e83a2a5b5607abe83e6f0'}, {'path': 'assets/ocean.png', 'size': 810643, 'sha256': '613c8c9545139f132b04df86d78091a04146e4bd7ce13648677ed208cdef4232'}, {'path': 'assets/wechat-official.jpg', 'size': 40993, 'sha256': '0a0cc622832dbb8617a2b740e93dbbdd035a7ca99b218ebb1cab26b010d08226'}, {'path': 'index.html', 'size': 10386, 'sha256': '04162bc799affc26f7f349f4d30e4be8b716c1446f02a38aac4689b72e7b6942'}, {'path': 'site.js', 'size': 996, 'sha256': 'fdfa40db480eadd76611197074b2d0c71566cdce0d6723862f36a2a4952bf53c'}, {'path': 'site.json', 'size': 339, 'sha256': '26ae6179c701c2c23c30b419716b2d52fb2c7f4440a1d4db05cbf04e9a5076ee'}, {'path': 'style.css', 'size': 12156, 'sha256': '074cbd2e61b7c8060f92a323e32f57bfe7ed26587a7949ef149a8ba16a4b4331'}]
ROOT=pathlib.Path('/opt/great-powers/official')
RELEASE=ROOT/'releases'/('20261012-'+COMMIT[:7])
BACKUP=pathlib.Path('/opt/great-powers/backups')/('20261012-official-'+COMMIT[:7])
CONFIG=pathlib.Path('/etc/nginx/great-powers.conf')
NGINX=shutil.which('nginx') or '/usr/sbin/nginx'
CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'"
def digest(data):return hashlib.sha256(data).hexdigest()
def run(args):
 r=subprocess.run(args,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr or r.stdout)
 return r.stderr+r.stdout
def atomic(path,data,mode=0o644):
 temp=path.with_name(path.name+'.official-tmp');temp.write_bytes(data);temp.chmod(mode);os.replace(temp,path)
def prepare():
 if (ROOT/'current').exists() or (ROOT/'current').is_symlink():raise RuntimeError('已有官网指针，请先检查，禁止覆盖未知版本')
 RELEASE.mkdir(parents=True,exist_ok=True,mode=0o755);BACKUP.mkdir(parents=True,exist_ok=True,mode=0o700)
 for item in MANIFEST:
  path=RELEASE/item['path'];path.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
  with urllib.request.urlopen('https://raw.githubusercontent.com/chencheng666/great-powers-rts/'+COMMIT+'/public/official/'+item['path'],timeout=45) as response:data=response.read(item['size']+1)
  if len(data)!=item['size'] or digest(data)!=item['sha256']:raise RuntimeError('文件校验失败：'+item['path'])
  atomic(path,data)
 original=CONFIG.read_bytes();text=original.decode();anchor=' location / {\n'
 if text.count(anchor)!=1 or '/official/' in text:raise RuntimeError('Nginx基线不匹配，停止而非盲改')
 location=' location = /official { return 302 /official/; }\n location /official/ {\n  alias /opt/great-powers/official/current/;\n  index index.html;\n  autoindex off;\n  add_header Content-Security-Policy "'+CSP+'" always;\n  add_header X-Content-Type-Options nosniff always;\n  add_header X-Frame-Options DENY always;\n  add_header Referrer-Policy same-origin always;\n  add_header Cache-Control "no-cache" always;\n  limit_except GET { deny all; }\n }\n'
 candidate=text.replace(anchor,location+anchor).encode();atomic(BACKUP/'nginx-before.conf',original,0o600);atomic(BACKUP/'nginx-official.conf',candidate,0o600)
 check=run([NGINX,'-t','-c',str(BACKUP/'nginx-official.conf')]);report={'sourceCommit':COMMIT,'release':str(RELEASE),'backup':str(BACKUP),'configMode':CONFIG.stat().st_mode&0o777,'configBeforeSha256':digest(original),'candidateConfigSha256':digest(candidate),'files':MANIFEST,'nginxTest':check,'applied':False,'databaseTouched':False,'gameProtocolChanged':False}
 atomic(BACKUP/'preflight.json',json.dumps(report,ensure_ascii=False,indent=2).encode(),0o600);print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False))
def apply():
 report=json.loads((BACKUP/'preflight.json').read_text());original=(BACKUP/'nginx-before.conf').read_bytes();candidate=(BACKUP/'nginx-official.conf').read_bytes()
 if digest(CONFIG.read_bytes())!=report['configBeforeSha256']:raise RuntimeError('Nginx已发生其他修改，停止发布')
 if (ROOT/'current').exists() or (ROOT/'current').is_symlink():raise RuntimeError('已有官网指针，停止发布')
 for item in MANIFEST:
  data=(RELEASE/item['path']).read_bytes()
  if len(data)!=item['size'] or digest(data)!=item['sha256']:raise RuntimeError('准备后文件改变：'+item['path'])
 run([NGINX,'-t','-c',str(BACKUP/'nginx-official.conf')]);link=ROOT/'current';next_link=ROOT/'current-next'
 if next_link.exists() or next_link.is_symlink():raise RuntimeError('临时指针已存在，请人工检查')
 try:
  next_link.symlink_to(RELEASE);os.replace(next_link,link);atomic(CONFIG,candidate,report['configMode']);run([NGINX,'-t','-c',str(CONFIG)]);run([NGINX,'-s','reload','-c',str(CONFIG)])
 except Exception:
  atomic(CONFIG,original,report['configMode']);link.unlink(missing_ok=True);run([NGINX,'-t','-c',str(CONFIG)]);run([NGINX,'-s','reload','-c',str(CONFIG)]);raise
 report['applied']=True;atomic(BACKUP/'preflight.json',json.dumps(report,ensure_ascii=False,indent=2).encode(),0o600);print(json.dumps({'applied':True,'url':'https://43.135.186.21:8443/official/','backup':str(BACKUP),'databaseTouched':False,'gameProtocolChanged':False}))
def rollback():
 report=json.loads((BACKUP/'preflight.json').read_text());link=ROOT/'current'
 if digest(CONFIG.read_bytes())!=report['candidateConfigSha256'] or not link.is_symlink() or link.resolve()!=RELEASE.resolve():raise RuntimeError('现场已变更，停止自动回滚，保护其他修改')
 atomic(CONFIG,(BACKUP/'nginx-before.conf').read_bytes(),report['configMode']);run([NGINX,'-t','-c',str(CONFIG)]);run([NGINX,'-s','reload','-c',str(CONFIG)]);link.unlink();report['applied']=False;atomic(BACKUP/'preflight.json',json.dumps(report,ensure_ascii=False,indent=2).encode(),0o600);print(json.dumps({'rolledBack':True,'databaseTouched':False,'gameProtocolChanged':False}))
if __name__=='__main__':
 parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group();group.add_argument('--apply',action='store_true');group.add_argument('--rollback',action='store_true');args=parser.parse_args();rollback() if args.rollback else apply() if args.apply else prepare()
