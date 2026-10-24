// 限制大文件同时传输的数量，短暂断流后重新请求；最终错误保留具体文件名。
export function createAssetLoader({ concurrency = 4, attempts = 3, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active--; drain(); });
    }
  };
  const schedule = run => new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); drain(); });
  return async (url, load) => {
    let cause;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { return await schedule(load); }
      catch (error) {
        cause = error;
        if (attempt + 1 < attempts) await wait(500 * (attempt + 1));
      }
    }
    const file = url.split('/').pop().split('?')[0];
    throw new Error(`${file}：${cause?.message || '网络中断或图片解码失败，请检查连接后重试'}`, { cause });
  };
}
export const loadAsset = createAssetLoader();
