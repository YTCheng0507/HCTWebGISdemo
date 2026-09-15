# -*- coding: utf-8 -*-
"""
========================================================================================
【模組名稱】：管理者認證與 SQLite 資料庫管理 (Auth DB Module)
【核心功能】：
    1. 使用者管理 (帳號、PBKDF2 密碼安全雜湊、角色權限分級)
    2. 會話管理 (24 小時時效安全 Token 簽發與驗證)
    3. 操作稽核紀錄 (Audit Log：圖資更新、權重微調、帳號異動完整追蹤)
========================================================================================
"""

import os
import json
import sqlite3
import hashlib
import secrets
import time
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin.db")
SEED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "users_seed.json")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: str = None):
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100_000
    )
    return key.hex(), salt

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    calc_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(calc_hash, expected_hash)

def export_users_seed():
    """將目前的管理者帳號與雜湊密碼持久化儲存至 users_seed.json，避免部署重置"""
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, username, password_hash, salt, name, role, created_at, last_login FROM users ORDER BY id ASC")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        if rows:
            with open(SEED_PATH, "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False, indent=2)
            print(f"[AuthDB] 已成功持久化同步 {len(rows)} 位使用者至 {SEED_PATH}")
    except Exception as e:
        print(f"[AuthDB] 備份 users_seed.json 失敗: {e}")

def restore_users_from_seed():
    """若資料庫中尚無使用者，嘗試從 users_seed.json 自動還原帳號與密碼"""
    if not os.path.exists(SEED_PATH):
        return False
    try:
        with open(SEED_PATH, "r", encoding="utf-8") as f:
            users = json.load(f)
        if not users or not isinstance(users, list):
            return False
        conn = get_connection()
        cur = conn.cursor()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        restored_cnt = 0
        for u in users:
            uid = u.get("id")
            if uid:
                cur.execute("""
                    INSERT OR IGNORE INTO users (id, username, password_hash, salt, name, role, created_at, last_login)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    uid,
                    u.get("username"),
                    u.get("password_hash"),
                    u.get("salt"),
                    u.get("name", "管理員"),
                    u.get("role", "maintainer"),
                    u.get("created_at", now_str),
                    u.get("last_login")
                ))
            else:
                cur.execute("""
                    INSERT OR IGNORE INTO users (username, password_hash, salt, name, role, created_at, last_login)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    u.get("username"),
                    u.get("password_hash"),
                    u.get("salt"),
                    u.get("name", "管理員"),
                    u.get("role", "maintainer"),
                    u.get("created_at", now_str),
                    u.get("last_login")
                ))
            if cur.rowcount > 0:
                restored_cnt += 1
        conn.commit()
        conn.close()
        if restored_cnt > 0:
            print(f"[AuthDB] 成功從 users_seed.json 還原 {restored_cnt} 位使用者帳號與密碼！")
            return True
    except Exception as e:
        print(f"[AuthDB] 從 users_seed.json 還原使用者失敗: {e}")
    return False

def init_db():
    conn = get_connection()
    cur = conn.cursor()

    # 1. 使用者資料表
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'maintainer',
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    """)

    # 2. 安全會話資料表
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )
    """)

    # 3. 操作稽核軌跡資料表
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL,
            ip TEXT,
            timestamp TEXT NOT NULL
        )
    """)

    conn.commit()

    # 若無任何使用者，優先從 users_seed.json 還原；若無種子檔，才初始化預設管理員
    cur.execute("SELECT COUNT(*) FROM users")
    count = cur.fetchone()[0]
    if count == 0:
        conn.close()
        restored = restore_users_from_seed()
        if not restored:
            conn = get_connection()
            cur = conn.cursor()
            initial_pwd = os.environ.get("ADMIN_PASSWORD") or os.environ.get("ADMIN_INITIAL_PASSWORD") or "admin888"
            pwd_hash, salt = hash_password(initial_pwd)
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute("""
                INSERT INTO users (username, password_hash, salt, name, role, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ("admin", pwd_hash, salt, "系統管理員", "superadmin", now_str))
            
            # 寫入初始化稽核紀錄
            cur.execute("""
                INSERT INTO audit_logs (username, action, detail, ip, timestamp)
                VALUES (?, ?, ?, ?, ?)
            """, ("system", "init_db", "系統初始化預設超級管理員帳號 (admin)", "127.0.0.1", now_str))
            
            conn.commit()
            conn.close()
            print("[AuthDB] 成功初始化 SQLite 資料庫與超級管理員 (admin)！")
            export_users_seed()
    else:
        conn.close()
        # 資料庫已有使用者，確保 users_seed.json 存在且為最新
        if not os.path.exists(SEED_PATH):
            export_users_seed()

# --- 驗證與會話 ---

def authenticate(username, password):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None

    if verify_password(password, row['salt'], row['password_hash']):
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("UPDATE users SET last_login = ? WHERE id = ?", (now_str, row['id']))
        conn.commit()
        user_info = {
            "id": row['id'],
            "username": row['username'],
            "name": row['name'],
            "role": row['role'],
            "last_login": now_str
        }
        conn.close()
        return user_info
    conn.close()
    return None

def create_session(user_id, username, role, duration_hours=24):
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + (duration_hours * 3600)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sessions (token, user_id, username, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
    """, (token, user_id, username, role, expires_at))
    conn.commit()
    conn.close()
    return token

def verify_session(token):
    if not token:
        return None
    conn = get_connection()
    cur = conn.cursor()
    now_ts = int(time.time())
    cur.execute("SELECT * FROM sessions WHERE token = ? AND expires_at > ?", (token, now_ts))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    res = {
        "user_id": row['user_id'],
        "username": row['username'],
        "role": row['role'],
        "expires_at": row['expires_at']
    }
    conn.close()
    return res

def delete_session(token):
    if not token:
        return
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

# --- 使用者 CRUD ---

def list_users():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, username, name, role, created_at, last_login FROM users ORDER BY id ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def create_user(username, password, name, role="maintainer"):
    if not username or not password or not name:
        return False, "所有欄位皆為必填"
    if role not in ["superadmin", "maintainer"]:
        return False, "身分角色無效"

    pwd_hash, salt = hash_password(password)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO users (username, password_hash, salt, name, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (username, pwd_hash, salt, name, role, now_str))
        conn.commit()
        conn.close()
        export_users_seed()
        return True, "使用者建立成功"
    except sqlite3.IntegrityError:
        conn.close()
        return False, "該帳號名稱已存在，請使用不同帳號"
    except Exception as e:
        conn.close()
        return False, str(e)

def delete_user(user_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    target = cur.fetchone()
    if not target:
        conn.close()
        return False, "找不到指定使用者"

    if target['role'] == 'superadmin':
        cur.execute("SELECT COUNT(*) FROM users WHERE role = 'superadmin'")
        super_cnt = cur.fetchone()[0]
        if super_cnt <= 1:
            conn.close()
            return False, "系統必須至少保留一名超級管理員，無法刪除"

    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    cur.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    export_users_seed()
    return True, "使用者已成功刪除"

def change_password(user_id, new_password):
    if not new_password or len(new_password) < 4:
        return False, "密碼長度至少需為 4 個字元"
    pwd_hash, salt = hash_password(new_password)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
    """, (pwd_hash, salt, user_id))
    conn.commit()
    conn.close()
    export_users_seed()
    return True, "密碼修改成功"

# --- 稽核日誌 ---

def add_audit_log(username, action, detail, ip=""):
    conn = get_connection()
    cur = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO audit_logs (username, action, detail, ip, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (username, action, detail, ip, now_str))
    conn.commit()
    conn.close()

def get_audit_logs(limit=50):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, username, action, detail, ip, timestamp 
        FROM audit_logs 
        ORDER BY id DESC LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

# 模組載入時自動初始化資料庫結構
init_db()
