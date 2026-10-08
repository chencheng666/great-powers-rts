import * as sqlite from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { nickname } from '../src/network-protocol.js';
const hash = value => createHash('sha256').update(value).digest('hex');
export class Accounts {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const Database = sqlite.DatabaseSync || sqlite.Database;
    const file = join(directory, 'guests.sqlite'); this.db = new Database(file); chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS guests(id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, draws INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, a TEXT, b TEXT, winner TEXT, at INTEGER);`);
  }
  find(cookie = '') {
    const token = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('gp_guest='))?.slice(9);
    return token ? this.db.prepare('SELECT id,name,wins,losses,draws FROM guests WHERE token=? AND expires>?').get(hash(token), Date.now()) : null;
  }
  create(name) {
    name = nickname(name); const token = randomBytes(32).toString('hex'), id = randomUUID();
    this.db.prepare('INSERT INTO guests(id,name,token,expires) VALUES(?,?,?,?)').run(id, name, hash(token), Date.now()+30*86400000);
    return { token, user: { id, name, wins: 0, losses: 0, draws: 0 } };
  }
  rename(id, name) { this.db.prepare('UPDATE guests SET name=? WHERE id=?').run(nickname(name), id); }
  settle(id, users, winner) {
    this.db.exec('BEGIN');
    try {
      const result = this.db.prepare('INSERT OR IGNORE INTO matches VALUES(?,?,?,?,?)').run(id, users[0].id, users[1].id, String(winner), Date.now());
      if (result.changes) users.forEach((u, side) => this.db.prepare(`UPDATE guests SET ${winner === 'draw' ? 'draws' : winner === side ? 'wins' : 'losses'} = ${winner === 'draw' ? 'draws' : winner === side ? 'wins' : 'losses'}+1 WHERE id=?`).run(u.id));
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
