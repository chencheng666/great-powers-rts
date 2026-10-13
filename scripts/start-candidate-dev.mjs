import {createBattleServer} from '../server/index.mjs';
import {createServer} from 'vite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const data=await mkdtemp(join(tmpdir(),'gp-six-local-')),servers=[];
let vite;
async function close(){
  await vite?.close();
  await Promise.all(servers.map(app=>new Promise(r=>{app.wss.clients.forEach(ws=>ws.terminate());app.server.close(r);app.server.closeAllConnections();})));
  await rm(data,{recursive:true,force:true});
}
try{
  for(const [port,maxPlayers]of [[4192,2],[4191,6]]){
    const app=createBattleServer({directory:join(data,String(maxPlayers)),origin:'http://127.0.0.1:4173',additionalOrigins:'http://localhost:4173',maxPlayers,dev:false});
    await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});servers.push(app);
  }
  vite=await createServer({server:{host:'127.0.0.1',port:4173,strictPort:true,watch:{ignored:['**/qa/**','**/releases/**','**/docs/**']},proxy:{'/api':{target:'http://127.0.0.1:4192'},'/battle-socket':{target:'ws://127.0.0.1:4192',ws:true}}}});
  await vite.listen();console.log('隔离双人/六方验收 http://127.0.0.1:4173/ 和 http://localhost:4173/，六方路径 /candidate/；临时数据库');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await close();process.exit(0);});
}catch(e){await close();console.error(e);process.exitCode=1;}
