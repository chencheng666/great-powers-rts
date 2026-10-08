import { networkInterfaces } from 'node:os';
import { createBattleServer } from '../server/index.mjs';

const port = Number(process.env.PORT || 4180);
const { server } = createBattleServer();
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请通过 PORT 环境变量选择其他端口` : error.message);
  process.exitCode = 1;
  server.close(() => {});
});
server.listen(port, '0.0.0.0', () => {
  console.log(`局域网对战服务已启动，本机访问：http://localhost:${port}/`);
  const addresses = [...new Set(Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address))];
  for (const address of addresses) console.log(`同一局域网的朋友访问：http://${address}:${port}/`);
  console.log('两位玩家必须访问同一服务地址；请仅对可信的本地网络放行此端口。');
});
