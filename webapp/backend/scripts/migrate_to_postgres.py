"""
One-shot data migration: Firebase RTDB JSON export + SQLite files -> PostgreSQL.

Idempotent: safe to re-run. Global tables upsert on their primary key;
per-user tables are wiped per (username) scope and re-inserted from source.
Sources are only read, never modified.

Usage:
    python scripts/migrate_to_postgres.py --dry-run
    python scripts/migrate_to_postgres.py
    python scripts/migrate_to_postgres.py --only firebase,users_pending
"""
import argparse
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import psycopg2.extras

import pg

ROOT = BACKEND.parent.parent  # project root
DATA = ROOT / "data"
FIREBASE_JSON = ROOT / "Sizing_db_firebase.json"

# authoritative sqlite paths, taken from the modules that own them
PENDING_GLOBAL_DB = str(DATA / "pending-global.db")
INQUIRY_DB = str(DATA / "inquiry.db")
MASS_SIZING_DB = str(DATA / "mass_sizing.db")
EXPORT_HISTORY_DB = str(BACKEND.parent / "data" / "pending_full_data.db")
PO_DB = str(BACKEND.parent / "data" / "po_tracking.db")

Json = psycopg2.extras.Json


def _sqlite(path):
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    return c


def _sqlite_tables(conn):
    return [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()]


def _pg_cols(cur, table):
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
        (table,),
    )
    return {r[0] for r in cur.fetchall()}


def _text_cols(cur, table):
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = %s AND data_type = 'text'",
        (table,),
    )
    return {r[0] for r in cur.fetchall()}


def _coerce(row, text_cols):
    """sqlite stores ints where pg declares TEXT — stringify those values."""
    return {
        k: (str(v) if k in text_cols and v is not None and not isinstance(v, str) else v)
        for k, v in row.items()
    }


def _bulk_insert(cur, table, rows, conflict=""):
    if not rows:
        return 0
    cols = list(rows[0].keys())
    cols_sql = ", ".join(f'"{c}"' for c in cols)
    psycopg2.extras.execute_values(
        cur,
        f'INSERT INTO {table} ({cols_sql}) VALUES %s {conflict}',
        [[r.get(c) for c in cols] for r in rows],
    )
    return len(rows)


def _bump_serial(cur, table, col):
    cur.execute(
        f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
        f"(SELECT COALESCE(MAX({col}), 0) + 1 FROM {table}), false)"
    )


def _user_dirs():
    return sorted(d for d in DATA.iterdir() if d.is_dir() and d.name != "po_documents")


# ── firebase ──────────────────────────────────────────────────────────────────

def migrate_firebase(cur, dry):
    src = json.loads(FIREBASE_JSON.read_text(encoding="utf-8"))
    rows = []
    for root, tree in src.items():
        if root == "products":
            for duration, prods in tree.items():
                items = enumerate(prods) if isinstance(prods, list) else prods.items()
                for pid, prod in items:
                    if prod is not None:
                        rows.append((root, f"{duration}/{pid}", prod))
        elif root == "approvals_archive":
            # single lifecycle root: archived tickets live under 'approvals' too
            for tid, ticket in tree.items():
                rows.append(("approvals", tid, ticket))
        else:
            for key, val in tree.items():
                rows.append((root, key, val))
    print(f"  firebase_store: {len(rows)} rows from {len(src)} roots")
    if dry:
        return
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO firebase_store (root, key, data) VALUES %s
           ON CONFLICT (root, key) DO UPDATE SET data = excluded.data, updated_at = now()""",
        [(r, k, Json(v)) for r, k, v in rows],
    )
    cur.execute("SELECT root, COUNT(*) FROM firebase_store GROUP BY root ORDER BY root")
    for root, n in cur.fetchall():
        print(f"    {root}: {n}")


# ── global sqlite tables (preserve primary keys, upsert) ─────────────────────

def _migrate_global(cur, table, sqlite_path, pk, dry, sqlite_table=None):
    p = Path(sqlite_path)
    if not p.exists():
        print(f"  {table}: source missing ({p.name}), skipped")
        return
    with _sqlite(sqlite_path) as sc:
        rows = [dict(r) for r in sc.execute(f'SELECT * FROM "{sqlite_table or table}"').fetchall()]
    pg_cols = _pg_cols(cur, table)
    text_cols = _text_cols(cur, table)
    rows = [_coerce({k: v for k, v in r.items() if k in pg_cols}, text_cols) for r in rows]
    print(f"  {table}: {len(rows)} rows")
    if dry or not rows:
        return
    _bulk_insert(cur, table, rows, f"ON CONFLICT ({pk}) DO NOTHING")
    _bump_serial(cur, table, pk)
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    print(f"    pg count now: {cur.fetchone()[0]}")


def migrate_pending(cur, dry):
    _migrate_global(cur, "pending", PENDING_GLOBAL_DB, "id", dry)


def _migrate_inquiry_file(cur, sqlite_path, username, dry):
    p = Path(sqlite_path)
    if not p.exists():
        return
    with _sqlite(sqlite_path) as sc:
        if "inquiry" not in _sqlite_tables(sc):
            return
        rows = [dict(r) for r in sc.execute("SELECT * FROM inquiry").fetchall()]
    pg_cols = _pg_cols(cur, "inquiry") - {"id", "username"}
    text_cols = _text_cols(cur, "inquiry")
    rows = [
        _coerce({**{k: v for k, v in r.items() if k in pg_cols}, "username": username}, text_cols)
        for r in rows
    ]
    print(f"  inquiry[{username or 'global'}]: {len(rows)} rows")
    if dry or not rows:
        return
    cur.execute("DELETE FROM inquiry WHERE username = %s", (username,))
    _bulk_insert(cur, "inquiry", rows)


def migrate_inquiry(cur, dry):
    _migrate_inquiry_file(cur, INQUIRY_DB, "", dry)


FORMULAS_DB = str(ROOT / "formulas.db")

def migrate_formulas(cur, dry):
    """Root formulas.db holds user-edited masters — override the pg seed values."""
    p = Path(FORMULAS_DB)
    if not p.exists():
        print("  formulas: source missing, skipped")
        return
    upserts = {
        "cell_voltages":      ("chemistry", ["nominal", "max_v", "end_v"]),
        "dc_to_cells":        ("dc_voltage", ["num_cells"]),
        "quote_rates":        ("key", ["value", "description"]),
        "modular_rack_rates": ("key", ["price"]),
    }
    with _sqlite(FORMULAS_DB) as sc:
        tables = _sqlite_tables(sc)
        for table, (pk, cols) in upserts.items():
            if table not in tables:
                continue
            rows = [dict(r) for r in sc.execute(f'SELECT * FROM "{table}"').fetchall()]
            print(f"  {table}: {len(rows)} rows")
            if dry or not rows:
                continue
            sets = ", ".join(f'"{c}" = excluded."{c}"' for c in cols)
            all_cols = [pk] + cols
            _bulk_insert(cur, table,
                         [{c: r.get(c) for c in all_cols} for r in rows],
                         f'ON CONFLICT ({pk}) DO UPDATE SET {sets}')


def migrate_mass_sizing(cur, dry):
    _migrate_global(cur, "mass_sizing", MASS_SIZING_DB, "sr_no", dry)


def migrate_export_history(cur, dry):
    p = Path(EXPORT_HISTORY_DB)
    if not p.exists():
        print("  export_history: source missing, skipped")
        return
    with _sqlite(EXPORT_HISTORY_DB) as sc:
        rows = [dict(r) for r in sc.execute("SELECT * FROM export_history").fetchall()]
    pg_cols = _pg_cols(cur, "export_history") - {"id"}
    text_cols = _text_cols(cur, "export_history")
    rows = [_coerce({k: v for k, v in r.items() if k in pg_cols}, text_cols) for r in rows]
    print(f"  export_history: {len(rows)} rows")
    if dry or not rows:
        return
    _bulk_insert(cur, "export_history", rows,
                 "ON CONFLICT (inquiry_code, exported_by, exported_at) DO NOTHING")
    cur.execute("SELECT COUNT(*) FROM export_history")
    print(f"    pg count now: {cur.fetchone()[0]}")


def migrate_po(cur, dry):
    _migrate_global(cur, "po_tracking", PO_DB, "id", dry)
    p = Path(PO_DB)
    if not p.exists():
        return
    with _sqlite(PO_DB) as sc:
        rows = [dict(r) for r in sc.execute("SELECT * FROM po_dispatches").fetchall()]
    print(f"  po_dispatches: {len(rows)} rows")
    if dry or not rows:
        return
    _bulk_insert(cur, "po_dispatches", rows, "ON CONFLICT (id) DO NOTHING")
    _bump_serial(cur, "po_dispatches", "id")


# ── per-user sqlite tables (wipe per user scope, re-insert) ──────────────────

def migrate_users_sizing(cur, dry):
    for d in _user_dirs():
        f = d / "sizing.db"
        if not f.exists():
            continue
        username = d.name
        with _sqlite(str(f)) as sc:
            projects = _sqlite_tables(sc)
            total = 0
            if not dry:
                cur.execute("DELETE FROM sizings WHERE username = %s", (username,))
                cur.execute("DELETE FROM sizing_projects WHERE username = %s", (username,))
            for proj in projects:
                rows = [dict(r) for r in sc.execute(f'SELECT * FROM "{proj}"').fetchall()]
                total += len(rows)
                if dry:
                    continue
                cur.execute(
                    "INSERT INTO sizing_projects (username, project_name) VALUES (%s, %s) "
                    "ON CONFLICT (username, project_name) DO NOTHING",
                    (username, proj),
                )
                pg_cols = _pg_cols(cur, "sizings")
                rows = [
                    {**{k: v for k, v in r.items() if k in pg_cols},
                     "username": username, "project_name": proj}
                    for r in rows
                ]
                _bulk_insert(cur, "sizings", rows,
                             "ON CONFLICT (username, project_name, sr_no) DO NOTHING")
        print(f"  sizings[{username}]: {len(projects)} projects, {total} rows")


def _migrate_temp_file(cur, username, scope, path, dry):
    """One temp.db/wizard_temp.db -> active_quotes + quote_items under (username, scope)."""
    if not Path(path).exists():
        return 0, 0
    with _sqlite(str(path)) as sc:
        tables = _sqlite_tables(sc)
        if "active_quotes" not in tables:
            return 0, 0
        quotes = [dict(r) for r in sc.execute("SELECT * FROM active_quotes").fetchall()]
        aq_cols = _pg_cols(cur, "active_quotes")
        qi_cols = _pg_cols(cur, "quote_items")
        qi_text = _text_cols(cur, "quote_items")
        n_items = 0
        if not dry:
            cur.execute("DELETE FROM active_quotes WHERE username = %s AND scope = %s",
                        (username, scope))
            cur.execute("DELETE FROM quote_items WHERE username = %s AND scope = %s",
                        (username, scope))
        for q in quotes:
            code = q["code"]
            items_tbl = "items_" + "".join(ch for ch in code if ch.isalnum() or ch == "_")
            items = []
            if items_tbl in tables:
                items = [dict(r) for r in sc.execute(f'SELECT * FROM "{items_tbl}"').fetchall()]
            n_items += len(items)
            if dry:
                continue
            row = {**{k: v for k, v in q.items() if k in aq_cols},
                   "username": username, "scope": scope}
            _bulk_insert(cur, "active_quotes", [row])
            items = [
                _coerce({**{k: v for k, v in it.items() if k in qi_cols},
                         "username": username, "scope": scope, "quote_code": code}, qi_text)
                for it in items
            ]
            _bulk_insert(cur, "quote_items", items)
        return len(quotes), n_items


def migrate_users_temp(cur, dry):
    for d in _user_dirs():
        username = d.name
        for scope, fname in (("normal", "temp.db"), ("wizard", "wizard_temp.db")):
            nq, ni = _migrate_temp_file(cur, username, scope, d / fname, dry)
            if nq or ni:
                print(f"  quotes[{username}/{scope}]: {nq} quotes, {ni} items")


def migrate_users_pending(cur, dry):
    item_cols = _pg_cols(cur, "pending_items")
    text_cols = _text_cols(cur, "pending_items")
    for d in _user_dirs():
        f = d / "pending.db"
        if not f.exists():
            continue
        username = d.name
        if not dry:
            cur.execute("DELETE FROM pending_items WHERE username = %s", (username,))
        total = 0
        with _sqlite(str(f)) as sc:
            for tbl in _sqlite_tables(sc):
                rows = [dict(r) for r in sc.execute(f'SELECT * FROM "{tbl}"').fetchall()]
                total += len(rows)
                if dry:
                    continue
                rows = [
                    _coerce({**{k: v for k, v in r.items() if k in item_cols and k != "id"},
                             "username": username, "pending_code": tbl}, text_cols)
                    for r in rows
                ]
                _bulk_insert(cur, "pending_items", rows)
        print(f"  pending_items[{username}]: {total} rows")


def migrate_users_inquiry(cur, dry):
    """Per-user inquiry.db files are each user's working sheet -> username-scoped rows."""
    for d in _user_dirs():
        _migrate_inquiry_file(cur, d / "inquiry.db", d.name, dry)


def migrate_users_costing(cur, dry):
    for d in _user_dirs():
        f = d / "costing.db"
        if not f.exists():
            continue
        username = d.name
        with _sqlite(str(f)) as sc:
            if "tree" not in _sqlite_tables(sc):
                continue
            rows = [dict(r) for r in sc.execute("SELECT * FROM tree").fetchall()]
        print(f"  costing_tree[{username}]: {len(rows)} rows")
        if dry:
            continue
        cur.execute("DELETE FROM costing_tree WHERE username = %s", (username,))
        _bulk_insert(cur, "costing_tree",
                     [{"username": username, "data": Json(r)} for r in rows])


STEPS = {
    "firebase": migrate_firebase,
    "pending": migrate_pending,
    "inquiry": migrate_inquiry,
    "formulas": migrate_formulas,
    "mass_sizing": migrate_mass_sizing,
    "export_history": migrate_export_history,
    "po": migrate_po,
    "users_sizing": migrate_users_sizing,
    "users_temp": migrate_users_temp,
    "users_pending": migrate_users_pending,
    "users_inquiry": migrate_users_inquiry,
    "users_costing": migrate_users_costing,
}


def backup_sources() -> Path:
    """Copy data/ + webapp/data/ + the Firebase export to a timestamped sibling folder."""
    dest = ROOT.parent / f"pg_migration_backup_{datetime.now():%Y%m%d_%H%M%S}"
    if DATA.exists():
        shutil.copytree(DATA, dest / "data")
    webapp_data = BACKEND.parent / "data"
    if webapp_data.exists():
        shutil.copytree(webapp_data, dest / "webapp_data")
    if FIREBASE_JSON.exists():
        shutil.copy2(FIREBASE_JSON, dest / FIREBASE_JSON.name)
    print(f"backup written to {dest}")
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="comma-separated step names " + str(list(STEPS)))
    ap.add_argument("--backup", action="store_true", help="back up sources before migrating")
    args = ap.parse_args()

    if args.backup and not args.dry_run:
        backup_sources()

    steps = args.only.split(",") if args.only else list(STEPS)
    for s in steps:
        if s not in STEPS:
            sys.exit(f"unknown step: {s}")

    pg.init_all_tables()
    with pg.get_conn() as conn:
        cur = conn.cursor()
        for s in steps:
            print(f"[{s}]" + (" (dry run)" if args.dry_run else ""))
            STEPS[s](cur, args.dry_run)
        if args.dry_run:
            conn.rollback()
    print("done.")


if __name__ == "__main__":
    main()
