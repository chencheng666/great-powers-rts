import { isDesktop, desktopInvoke } from './desktop.js';
import { FACTIONS, MAPS, VICTORY_MODES } from './data.js';
import { nickname, roomCode, PROTOCOL_VERSION } from './network-protocol.js';
const key='great-powers-player-name-v1';
export class OnlineClient {
  constructor({refreshIcons,prepare,onBattle,onSnapshot,onNotice,onStatus,onInterrupted,onAck,config}) {
    Object.assign(this,{refreshIcons,prepare,onBattle,onSnapshot,onNotice,onStatus,onInterrupted,onAck,config});
    this.dialog=document.querySelector('#online-dialog');this.nameDialog=document.querySelector('#nickname-dialog');this.seq=0;this.retries=0;
    this.dialog.addEventListener('click',e=>{const action=e.target.closest('[data-online]')?.dataset.online;if(action!=='join')this.action(action);});
    this.dialog.querySelector('.join-room').addEventListener('submit',e=>{e.preventDefault();this.action('join');});
    this.dialog.querySelector('#join-code').addEventListener('input',()=>this.showError(''));
    this.dialog.addEventListener('change',e=>{if(e.target.id==='online-faction')this.send({type:'faction',faction:e.target.value});});
    this.nameDialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();this.saveName();});
    this.nameDialog.addEventListener('cancel',e=>{if(!this.name)e.preventDefault();});
    document.querySelector('#online-btn').addEventListener('click',()=>this.open());
    document.querySelector('#player-name-btn').addEventListener('click',()=>this.editName());
    let name='';try{name=localStorage.getItem(key)||'';}catch{}
    this.name=name;this.renderName();if(!name)this.editName();
    if(name && !isDesktop())fetch('/api/session').then(r=>r.ok?r.json():null).then(data=>{if(data?.user&&data.room?.code){this.user=data.user;this.room=data.room;this.connect().catch(()=>{});}}).catch(()=>{});
  }
  renderName(){document.querySelector('#player-name').textContent=this.name||'指挥官';}
  editName(){this.nameDialog.querySelector('input').value=this.name||'';this.nameDialog.querySelector('[role=alert]').textContent='';if(!this.nameDialog.open)this.nameDialog.showModal();}
  async saveName(){
    try{
      const name=nickname(this.nameDialog.querySelector('input').value);
      if(this.user){await this.session(name);this.socket?.close(1000,'昵称已更新');}
      this.name=name;try{localStorage.setItem(key,name);}catch{}this.renderName();this.nameDialog.close();
    }catch(e){this.nameDialog.querySelector('[role=alert]').textContent=e.message;}
  }
  async session(name=this.name){
    if(!['http:','https:'].includes(location.protocol))throw new Error('离线文件不能直接联机，请打开在线试玩地址或局域网服务地址');
    let response;
    try{response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name}),signal:AbortSignal.timeout(10000)});}
    catch{throw new Error('连接对战服务超时或网络不可达，单机作战仍可使用');}
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||'对战服务暂不可用，单机作战仍可使用');
    if(!data?.user?.id)throw new Error('此地址没有可用的对战服务，请打开在线试玩或局域网服务地址');
    this.user=data.user;return data;
  }
  async open(){
    if (isDesktop()) { await this.openDesktop(); return; }
    if(!this.name){this.editName();return;}
    this.dialog.showModal();this.showError('');this.render();this.dialog.querySelector('#online-status').textContent='正在连接战区…';
    try{await this.session();await this.connect();this.render();}catch(e){this.showError(e.message);this.render();}
  }
  async openDesktop(){
    if(this.desktopOpening)return;
    this.desktopOpening=true;
    let dialog=document.querySelector('#desktop-online-dialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='desktop-online-dialog';dialog.className='online-dialog';
      dialog.setAttribute('aria-labelledby','desktop-online-title');
      dialog.innerHTML='<h2 id="desktop-online-title">联网对战</h2><p role="status"></p><p role="alert" class="online-error"></p><footer><button class="secondary-btn" data-desktop-retry>重试连接</button><button class="secondary-btn" data-desktop-return>返回单机</button></footer>';
      document.body.append(dialog);
      dialog.querySelector('[data-desktop-retry]').addEventListener('click',()=>this.openDesktop());
      dialog.querySelector('[data-desktop-return]').addEventListener('click',()=>dialog.close());
    }
    const retry=dialog.querySelector('[data-desktop-retry]');retry.disabled=true;
    dialog.querySelector('[role=status]').textContent='正在加载独立联网窗口，最长等待20秒…';
    dialog.querySelector('[role=alert]').textContent='';if(!dialog.open)dialog.showModal();
    try{await desktopInvoke('desktop_online');dialog.close();}
    catch(e){dialog.querySelector('[role=status]').textContent='联网窗口未能打开';dialog.querySelector('[role=alert]').textContent=String(e);}
    finally{this.desktopOpening=false;retry.disabled=false;}
  }
  connect(){
    if(this.socket?.readyState===WebSocket.OPEN)return Promise.resolve();
    if(this.connecting)return this.connecting;
    this.connecting=new Promise((resolve,reject)=>{
      const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/battle-socket`);this.socket=ws;
      let welcomed=false;
      const fail=message=>{clearTimeout(timeout);reject(new Error(message));};
      const timeout=setTimeout(()=>{fail('连接超时，请重新连接');ws.close();},10000);
      ws.onopen=()=>{this.seq=0;this.onStatus('正在确认战区身份');};
      ws.onerror=()=>fail('无法连接对战服务，请检查网络或重新连接');
      ws.onmessage=async e=>{
        const m=JSON.parse(e.data);
        if(m.type==='hello'){
          if(m.protocol!==PROTOCOL_VERSION){fail('游戏与服务版本不一致，请刷新网页或更新桌面版');ws.close();return;}
          welcomed=true;clearTimeout(timeout);this.user=m.user;this.room=m.room;this.retries=0;
          if(this.inBattle&&!m.room){this.inBattle=false;this.onInterrupted?.();}this.render();this.onStatus('已连接');resolve();
        }
        else if(m.type==='room'){this.room=m.room;this.render();}
        else if(m.type==='battle'){this.room=m.room;this.latest=m;this.inBattle=true;this.dialog.close();await this.onBattle(m);}
        else if(m.type==='snapshot'){this.room=m.room;this.latest=m;this.onSnapshot(m);this.onStatus(m.view.paused?'等待对手重连':'联网对战');}
        else if(m.type==='error'){this.showError(m.message);this.onNotice(m.message,true);}
        else if(m.type==='ack'){if(!m.ok)this.onNotice('指令未执行，请检查条件或重新选择目标',true);else this.onAck?.(m.action);}
      };
      ws.onclose=e=>{
        clearTimeout(timeout);this.onStatus('连接已中断');
        if(!welcomed)reject(new Error('对战连接已关闭，请重新连接'));
        if(e.reason==='会话已在另一窗口打开'){this.showError('同一浏览器的其他窗口已连接；两位玩家请使用不同电脑或不同浏览器');this.onNotice(e.reason,true);this.render();return;}
        if(this.room&&this.retries<7){const delay=Math.min(10000,1000*2**this.retries++);setTimeout(()=>this.connect().catch(()=>{}),delay);}
        this.render();
      };
    }).finally(()=>this.connecting=null);return this.connecting;
  }
  send(message){if(this.socket?.readyState!==WebSocket.OPEN){this.onNotice('连接尚未恢复，请稍候',true);return false;}if(message.type==='command')message.seq=++this.seq;this.socket.send(JSON.stringify(message));return true;}
  showError(message){this.dialog.querySelector('#online-error').textContent=message;}
  async action(action){
    if(!action)return;
    try{
      if(action==='close'){this.dialog.close();return;}
      this.showError('');
      if(action==='connect'){await this.session();await this.connect();this.render();return;}
      if(action==='create'||action==='join'){
        const code=action==='join'?roomCode(this.dialog.querySelector('#join-code').value):null;
        if(this.socket?.readyState!==WebSocket.OPEN||this.connecting){await this.session();await this.connect();}
        if(this.room?.code)throw new Error('你已在房间中，请先退出当前房间');
        if(action==='create')this.send({type:'create',...this.config()});
        else{this.dialog.querySelector('#join-code').value=code;this.send({type:'join',code,faction:this.config().faction});}
      }
      else if(action==='ready'){
        const me=this.room.members.find(m=>m?.id===this.user.id);
        if(!me.ready){this.dialog.querySelector('#online-status').textContent='正在载入战场素材…';await this.prepare();}
        this.send({type:'ready',ready:!me.ready});
      }else if(action==='start')this.send({type:'start'});
      else if(action==='leave'){this.send({type:'leave'});this.room=null;this.render();}
    }catch(e){this.showError(e.message);}
  }
  leave(){this.send({type:'leave'});this.inBattle=false;this.room=null;}
  render(){
    const connected=this.socket?.readyState===WebSocket.OPEN,r=this.room,hasRoom=!!r?.code;
    this.dialog.querySelector('#online-status').textContent=connected?'战区已连接 · 游客非排位':this.room?'连接中断，正在重连…':'尚未连接战区';
    this.dialog.querySelector('#online-welcome').textContent=this.user?`${this.user.name} #${this.user.id.slice(0,6)} · ${this.user.wins} 胜 ${this.user.losses} 负 ${this.user.draws} 平`:'指挥官待命';
    this.dialog.querySelector('#online-setup').hidden=hasRoom;this.dialog.querySelector('#online-room').hidden=!hasRoom;
    this.dialog.querySelectorAll('[data-online=create],[data-online=join]').forEach(b=>b.disabled=!connected);
    if(!hasRoom)return;
    this.dialog.querySelector('#room-code').textContent=r.code;
    this.dialog.querySelector('#room-map').textContent=`${MAPS[r.config.mapId].name} · ${VICTORY_MODES[r.config.victoryMode].name}`;
    const list=this.dialog.querySelector('#room-members');list.replaceChildren();
    r.members.forEach((m,i)=>{const row=document.createElement('div');row.className='room-member';const name=document.createElement('strong');name.textContent=m?`${m.name} #${m.id.slice(0,6)}`:'等待指挥官加入';const status=document.createElement('span');status.textContent=m?`${FACTIONS[m.faction].name} · ${m.connected?m.ready?'已准备':'待准备':'已掉线'}${r.host===i?' · 房主':''}`:'空闲席位';row.append(name,status);list.append(row);});
    const me=r.members.find(m=>m?.id===this.user.id),f=this.dialog.querySelector('#online-faction');
    if(!f.options.length)f.innerHTML=Object.entries(FACTIONS).map(([id,d])=>`<option value="${id}">${d.name}</option>`).join('');f.value=me.faction;
    const ready=this.dialog.querySelector('[data-online=ready]');ready.textContent=me.ready?'取消准备':'准备作战';ready.disabled=!connected||r.status!=='waiting';f.disabled=r.status!=='waiting';
    this.dialog.querySelector('[data-online=start]').disabled=!connected||r.host!==r.members.indexOf(me)||!r.members.every(m=>m?.ready&&m.connected)||r.status!=='waiting';
  }
}
