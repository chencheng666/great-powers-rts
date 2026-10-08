import { defineConfig } from 'vite';
export default defineConfig({ server:{ proxy:{ '/api':'http://127.0.0.1:4180', '/battle-socket':{ target:'ws://127.0.0.1:4180', ws:true } } } });
