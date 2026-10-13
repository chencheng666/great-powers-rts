import { defineConfig } from 'vite';
export default defineConfig({ server:{ proxy:{ '/candidate/api':{target:'http://127.0.0.1:4191',rewrite:p=>p.replace(/^\/candidate/,'')}, '/candidate/battle-socket':{target:'ws://127.0.0.1:4191',ws:true,rewrite:p=>p.replace(/^\/candidate/,'')}, '/api':'http://127.0.0.1:4180', '/battle-socket':{ target:'ws://127.0.0.1:4180', ws:true } } } });
