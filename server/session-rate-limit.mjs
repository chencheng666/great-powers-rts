export class SessionRateLimit {
  constructor({ capacity = 1000, limit = 30, windowMs = 60000 } = {}) {
    this.capacity = capacity;
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  accept(ip, now = Date.now()) {
    const entry = this.entries.get(ip);
    if (entry && entry.until > now) {
      if (entry.count >= this.limit) return false;
      entry.count++;
      return true;
    }
    if (this.entries.size >= this.capacity) {
      for (const [key, value] of this.entries) if (value.until <= now) this.entries.delete(key);
      // 容量满时拒绝新增来源，不能淘汰仍有效的记录而绕过限流。
      if (this.entries.size >= this.capacity) return false;
    }
    this.entries.set(ip, { until: now + this.windowMs, count: 1 });
    return true;
  }
}
