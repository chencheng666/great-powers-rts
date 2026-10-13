#!/usr/bin/env python3
"""仅清理 1.0 公网验收生成的游客与对局，保留发布前及真实玩家数据。"""

import argparse
import sqlite3
import time
import urllib.request
from pathlib import Path


ROOT = Path("/opt/great-powers/backups/20261013-v100")
SERVICES = {
    "main": (Path("/var/lib/great-powers/guests.sqlite"), 8088),
    "six": (Path("/opt/great-powers/candidate-data/guests.sqlite"), 8089),
}


def health(port):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=10) as response:
        import json

        data = json.load(response)
    if data.get("version") != "1.0.0" or data.get("rooms") or data.get("battles"):
        raise RuntimeError(f"服务 {port} 不是空闲的 1.0.0，终止清理")


def ids(connection, query):
    return {row[0] for row in connection.execute(query)}


def has_table(connection, name):
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def process(name, path, port, apply):
    health(port)
    if not path.is_file():
        raise RuntimeError(f"数据库不存在：{path}")

    db = sqlite3.connect(path, timeout=15)
    try:
        targets = {row[0] for row in db.execute(
            "SELECT id FROM guests WHERE name LIKE '验收V1-%'"
        )}
        if name == "main":
            historical = sqlite3.connect(
                f"file:{ROOT / 'data/guests.sqlite'}?mode=ro", uri=True
            )
            try:
                old_guests = ids(historical, "SELECT id FROM guests")
                old_matches = ids(historical, "SELECT id FROM matches")
            finally:
                historical.close()
            if len(old_guests) < 21 or len(old_matches) < 6 or targets & old_guests:
                raise RuntimeError("发布前历史记录校验失败，终止清理")
        else:
            old_guests = old_matches = set()

        pairs = db.execute("SELECT id,a,b FROM matches").fetchall()
        regular = {
            match_id for match_id, a, b in pairs if a in targets and b in targets
        }
        if any(
            (a in targets or b in targets) and match_id not in regular
            for match_id, a, b in pairs
        ):
            raise RuntimeError("测试游客参与了非测试双人对局，终止清理")

        members = (
            db.execute("SELECT match_id,guest,control_type FROM match_members").fetchall()
            if has_table(db, "match_members") else []
        )
        grouped = {}
        for match_id, guest, control_type in members:
            grouped.setdefault(match_id, []).append((guest, control_type))
        multi = {
            match_id for match_id, group in grouped.items()
            if any(guest in targets for guest, _ in group)
            and all(control_type == "ai" or guest in targets
                    for guest, control_type in group)
        }
        if any(
            guest in targets and match_id not in multi
            for match_id, guest, _ in members
        ):
            raise RuntimeError("测试游客参与了非测试六方对局，终止清理")

        print(f"{name}: 测试游客 {len(targets)}，双人对局 {len(regular)}，六方对局 {len(multi)}")
        if not apply or not targets:
            return

        ROOT.mkdir(parents=True, exist_ok=True)
        snapshot = ROOT / f"qa-pre-clean-{name}-{int(time.time())}.sqlite"
        with sqlite3.connect(snapshot) as backup:
            db.backup(backup)
        snapshot.chmod(0o600)

        db.execute("BEGIN IMMEDIATE")
        try:
            if multi:
                db.executemany("DELETE FROM match_members WHERE match_id=?", ((i,) for i in multi))
                db.executemany("DELETE FROM multi_matches WHERE id=?", ((i,) for i in multi))
            db.executemany("DELETE FROM matches WHERE id=?", ((i,) for i in regular))
            db.executemany("DELETE FROM guests WHERE id=?", ((i,) for i in targets))
            if name == "main":
                if not old_guests <= ids(db, "SELECT id FROM guests"):
                    raise RuntimeError("历史游客缺失")
                if not old_matches <= ids(db, "SELECT id FROM matches"):
                    raise RuntimeError("历史战绩缺失")
            db.commit()
        except Exception:
            db.rollback()
            raise
        print(f"{name}: 清理完成，备份 {snapshot}")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    for name, (path, port) in SERVICES.items():
        process(name, path, port, args.apply)


if __name__ == "__main__":
    main()
