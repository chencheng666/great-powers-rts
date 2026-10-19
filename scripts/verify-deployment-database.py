"""回归发布脚本的实际数据库比对代码，不连接生产数据库。"""
import ast
import json
import pathlib
import subprocess
import tempfile

source=ast.parse(pathlib.Path(__file__).with_name('deploy-strategic-release.py').read_text())
compare=next(ast.literal_eval(n.value) for n in ast.walk(source) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='compare' for t in n.targets))
schema="CREATE TABLE guests(id TEXT,wins INT,losses INT,draws INT);CREATE TABLE matches(id TEXT);INSERT INTO guests VALUES('a',3,0,0);"
setup="import {DatabaseSync} from 'node:sqlite';for(const p of process.argv.slice(1)){const d=new DatabaseSync(p);d.exec("+json.dumps(schema)+");d.close();}"
with tempfile.TemporaryDirectory() as folder:
    a,b=[str(pathlib.Path(folder)/n) for n in ['before.sqlite','after.sqlite']]
    subprocess.run(['node','--input-type=module','-e',setup,a,b],check=True,capture_output=True)
    def verify(ok):
        result=subprocess.run(['node','--input-type=module','-e',compare,a,b],capture_output=True,text=True)
        assert (result.returncode==0)==ok,result.stderr
    change="import{DatabaseSync}from'node:sqlite';const d=new DatabaseSync(process.argv[1]);d.exec(process.argv[2]);d.close();"
    def sql(path,value):
        subprocess.run(['node','--input-type=module','-e',change,path,value],check=True,capture_output=True)
    verify(True)
    sql(b,'CREATE TABLE multi_matches(id TEXT);CREATE TABLE match_members(id TEXT);');verify(True)
    sql(a,"CREATE TABLE multi_matches(id TEXT);INSERT INTO multi_matches VALUES('x');");verify(False)
    sql(b,"INSERT INTO multi_matches VALUES('x');UPDATE guests SET wins=2;");verify(False)
    sql(b,'UPDATE guests SET wins=3;DELETE FROM guests;');verify(False)
print('数据库回归5项通过：兼容缺少可选表，历史行或战绩减少均拒绝。')
