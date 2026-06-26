import calendar as _calendar
import re
import sqlite3
import time
from datetime import date as _date
from pathlib import Path

_DB_PATH = str(Path(__file__).parent.parent.parent / "data" / "inquiry.db")

_COLS = [
    "sr_no", "inquiry_code", "inquiry_date", "type", "sales_person", "solution_provider",
    "project_customer", "ups_make", "ups_model", "ups_kva", "actual_load_kva",
    "load_kw", "power_factor", "inverter_efficiency", "dc_voltage", "backup_min",
    "cell_chemistry", "ageing_pct", "design_margin_pct", "dod_margin_pct",
    "derating_pct", "capacity_ah", "centre_tap", "cell_type", "ageing_type", "backup_time_min", "part_code",
    "qty_system", "rate_system", "price_system",
    "rack_dim", "qty", "per_rack_price", "price", "custom_cost_desc", "custom_cost_price",
    "rack1_dim", "rack1_qty", "rack1_rate", "rack1_price",
    "rack2_dim", "rack2_qty", "rack2_rate", "rack2_price",
    "cc1_desc", "cc1_price",
    "cc2_desc", "cc2_price",
    "cc3_desc", "cc3_price",
    "cc4_desc", "cc4_price",
    "cc5_desc", "cc5_price",
    "datasheet", "sizing_sheet", "gad", "battery_compliance", "warranty",
    "remarks", "handled_by",
    "submission_date", "submitted_to", "submitted_by", "created_at", "quote_code", "sol_no",
    "dollar_rate", "base_partcode", "quote_format",
]


_GLOBAL_SEARCH_COLS = [
    "inquiry_code", "solution_provider", "project_customer", "part_code",
    "sales_person", "handled_by", "submitted_to", "submitted_by", "ups_kva",
    "type", "cell_type", "cell_chemistry",
]
_SELECT_FILTER_COLS = frozenset({"cell_type", "centre_tap", "ageing_type"})
_DATE_FILTER_COLS   = frozenset({"inquiry_date", "submission_date"})
_TEXT_FILTER_COLS   = frozenset({
    "inquiry_code", "type", "sales_person", "solution_provider",
    "project_customer", "cell_chemistry", "handled_by", "submitted_to", "submitted_by",
})
_ALL_FILTER_COLS = _SELECT_FILTER_COLS | _DATE_FILTER_COLS | _TEXT_FILTER_COLS


def _date_sql(col: str, encoded: str):
    if encoded.startswith("exact:"):
        return f'{col} = ?', [encoded[6:]]
    if encoded.startswith("month:"):
        return f'{col} LIKE ?', [encoded[6:] + "%"]
    if encoded.startswith("year:"):
        return f'{col} LIKE ?', [encoded[5:] + "%"]
    if encoded.startswith("from:"):
        return f'{col} >= ?', [encoded[5:]]
    if encoded.startswith("to:"):
        return f'{col} <= ?', [encoded[3:]]
    if encoded.startswith("range:"):
        parts = encoded[6:].split("|", 1)
        frm, to = parts[0], (parts[1] if len(parts) > 1 else "")
        conds, params = [], []
        if frm: conds.append(f'{col} >= ?'); params.append(frm)
        if to:  conds.append(f'{col} <= ?'); params.append(to)
        return (" AND ".join(conds) if conds else "1=1"), params
    if encoded.startswith("nfrom:"):
        parts = encoded[6:].split("|", 1)
        n, start = int(parts[0] or 0), (parts[1] if len(parts) > 1 else "")
        if not start: return "1=1", []
        d = _date.fromisoformat(start)
        month = d.month - 1 + n
        yr = d.year + month // 12; mo = month % 12 + 1
        end = _date(yr, mo, min(d.day, _calendar.monthrange(yr, mo)[1])).isoformat()
        return f'{col} >= ? AND {col} <= ?', [start, end]
    if encoded.startswith("nto:"):
        parts = encoded[4:].split("|", 1)
        n, end = int(parts[0] or 0), (parts[1] if len(parts) > 1 else "")
        if not end: return "1=1", []
        d = _date.fromisoformat(end)
        month = d.month - 1 - n
        yr = d.year + month // 12; mo = month % 12 + 1
        start = _date(yr, mo, min(d.day, _calendar.monthrange(yr, mo)[1])).isoformat()
        return f'{col} >= ? AND {col} <= ?', [start, end]
    return f'{col} LIKE ?', [f'%{encoded}%']


def _build_where(search: str, fields: dict):
    conds, params = [], []
    if search.strip():
        q = f"%{search.strip()}%"
        or_conds = " OR ".join(f'i."{c}" LIKE ?' for c in _GLOBAL_SEARCH_COLS)
        conds.append(f"({or_conds})")
        params.extend([q] * len(_GLOBAL_SEARCH_COLS))
    for key, val in fields.items():
        if not val or key not in _ALL_FILTER_COLS:
            continue
        col = f'i."{key}"'
        if key in _DATE_FILTER_COLS:
            frag, ps = _date_sql(col, val)
            conds.append(frag); params.extend(ps)
        elif key in _SELECT_FILTER_COLS:
            conds.append(f'{col} = ?'); params.append(val)
        else:
            conds.append(f'{col} LIKE ?'); params.append(f'%{val}%')
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    return where, params


_BASE_SQL = """
    WITH grp AS (
        SELECT inquiry_code, MAX(sr_no) AS newest_sr
        FROM inquiry
        WHERE inquiry_code IS NOT NULL AND inquiry_code != ''
        GROUP BY inquiry_code
    )
    SELECT i.* FROM inquiry i
    LEFT JOIN grp
        ON i.inquiry_code = grp.inquiry_code
       AND i.inquiry_code IS NOT NULL
       AND i.inquiry_code != ''
    {where}
    ORDER BY COALESCE(grp.newest_sr, i.sr_no) DESC,
             CAST(i.sol_no AS INTEGER) ASC,
             i.sr_no ASC
"""


def list_inquiry_page(page: int, limit: int, search: str, fields: dict, db_path=None) -> list:
    init_inquiry_db(db_path)
    where, params = _build_where(search, fields)
    offset = (page - 1) * limit
    sql = _BASE_SQL.format(where=where) + " LIMIT ? OFFSET ?"
    with _conn(db_path) as c:
        rows = [dict(r) for r in c.execute(sql, params + [limit, offset]).fetchall()]
    for r in rows:
        r["_id"] = str(r["sr_no"])
    return rows


def count_inquiry(search: str, fields: dict, db_path=None) -> int:
    init_inquiry_db(db_path)
    where, params = _build_where(search, fields)
    sql = f"""
        WITH grp AS (
            SELECT inquiry_code, MAX(sr_no) AS newest_sr
            FROM inquiry
            WHERE inquiry_code IS NOT NULL AND inquiry_code != ''
            GROUP BY inquiry_code
        )
        SELECT COUNT(*) FROM inquiry i
        LEFT JOIN grp
            ON i.inquiry_code = grp.inquiry_code
           AND i.inquiry_code IS NOT NULL
           AND i.inquiry_code != ''
        {where}
    """
    with _conn(db_path) as c:
        return c.execute(sql, params).fetchone()[0]


def export_inquiry_rows(search: str, fields: dict, db_path=None) -> list:
    """All rows matching filters — no pagination, used for Excel export."""
    init_inquiry_db(db_path)
    where, params = _build_where(search, fields)
    sql = _BASE_SQL.format(where=where)
    with _conn(db_path) as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def _conn(db_path=None):
    c = sqlite3.connect(db_path or _DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_inquiry_db(db_path=None):
    col_defs = ", ".join(
        f'"{c}" {"INTEGER" if c in ("sr_no", "created_at") else "TEXT"}'
        for c in _COLS
    )
    with _conn(db_path) as c:
        c.execute(f'CREATE TABLE IF NOT EXISTS inquiry ({col_defs})')
        c.execute('CREATE TABLE IF NOT EXISTS inquiry_meta (next_id INTEGER DEFAULT 1)')
        if not c.execute('SELECT 1 FROM inquiry_meta').fetchone():
            c.execute('INSERT INTO inquiry_meta VALUES (1)')
        for col in [
            "quote_code", "sol_no", "ageing_type", "backup_time_min", "inquiry_code", "handled_by",
            "rack1_dim", "rack1_qty", "rack1_rate", "rack1_price",
            "rack2_dim", "rack2_qty", "rack2_rate", "rack2_price",
            "cc1_desc", "cc1_price",
            "cc2_desc", "cc2_price",
            "cc3_desc", "cc3_price",
            "cc4_desc", "cc4_price",
            "cc5_desc", "cc5_price",
            "submitted_by", "dollar_rate", "base_partcode", "quote_format",
        ]:
            try:
                c.execute(f'ALTER TABLE inquiry ADD COLUMN "{col}" TEXT')
            except Exception:
                pass
        try:
            c.execute("UPDATE inquiry SET warranty = '5' WHERE warranty = '5 year'")
        except Exception:
            pass


def suggest_next_inquiry_code(db_path=None) -> dict:
    init_inquiry_db(db_path)
    with _conn(db_path) as c:
        row = c.execute(
            "SELECT inquiry_code FROM inquiry WHERE inquiry_code IS NOT NULL AND inquiry_code != '' ORDER BY sr_no DESC LIMIT 1"
        ).fetchone()
    last = dict(row)["inquiry_code"] if row else ""
    if not last:
        return {"last": "", "suggestion": ""}
    m = re.match(r"^(.*?)(\d+)$", last)
    if m:
        prefix, num = m.group(1), m.group(2)
        suggestion = f"{prefix}{str(int(num) + 1).zfill(len(num))}"
    else:
        suggestion = last + "1"
    return {"last": last, "suggestion": suggestion}


def _next_sr(db_path=None) -> int:
    with _conn(db_path) as c:
        row = c.execute('SELECT MAX(sr_no) FROM inquiry').fetchone()
        return (row[0] or 0) + 1


def push_row(data: dict, db_path=None) -> str:
    init_inquiry_db(db_path)
    sr = _next_sr(db_path)
    data = {**data, "sr_no": sr, "created_at": int(time.time() * 1000)}
    cols = [k for k in data if k in _COLS]
    ph = ", ".join("?" * len(cols))
    qs = ", ".join(f'"{c}"' for c in cols)
    with _conn(db_path) as c:
        c.execute(f'INSERT INTO inquiry ({qs}) VALUES ({ph})', [data[k] for k in cols])
    return str(sr)


def list_rows(db_path=None) -> list:
    init_inquiry_db(db_path)
    with _conn(db_path) as c:
        rows = [dict(r) for r in c.execute('SELECT * FROM inquiry ORDER BY sr_no').fetchall()]
    for r in rows:
        r["_id"] = str(r["sr_no"])
    return rows


def update_row(sr_no: int, data: dict, db_path=None):
    init_inquiry_db(db_path)
    fields = [k for k in data if k in _COLS and k != "sr_no"]
    if not fields:
        return
    sets = ", ".join(f'"{f}" = ?' for f in fields)
    with _conn(db_path) as c:
        c.execute(f'UPDATE inquiry SET {sets} WHERE sr_no = ?', [data[f] for f in fields] + [sr_no])


def delete_row(sr_no: int, db_path=None):
    init_inquiry_db(db_path)
    with _conn(db_path) as c:
        c.execute('DELETE FROM inquiry WHERE sr_no = ?', (sr_no,))


def sync_inquiry_for_quote(quote_code: str, items: list, db_path=None):
    """Re-derive rack/custom fields for each system row in inquiry."""
    init_inquiry_db(db_path)
    system_items = [i for i in items if str(i.get("item_type", "system")) == "system"]
    rack_items   = [i for i in items if str(i.get("item_type", "")) == "rack"]
    custom_items = [i for i in items if str(i.get("item_type", "")) == "custom"]

    for sys_item in system_items:
        sol_no = str(sys_item.get("sol_no", ""))
        sys_sr = int(sys_item.get("sr_no", 0))

        next_sys_sr = min(
            (int(s.get("sr_no", 0)) for s in system_items if int(s.get("sr_no", 0)) > sys_sr),
            default=999999
        )
        my_racks = [r for r in rack_items
                    if sys_sr < int(r.get("sr_no", 0)) < next_sys_sr]
        my_customs = [r for r in custom_items
                      if sys_sr < int(r.get("sr_no", 0)) < next_sys_sr]

        fields: dict = {}

        # rack slots (max 2)
        for i, rack in enumerate(my_racks[:2], start=1):
            rp = float(rack.get("quote_price", 0)) * int(rack.get("quantity", 1))
            fields[f"rack{i}_dim"]   = str(rack.get("modular_rack", ""))
            fields[f"rack{i}_qty"]   = str(rack.get("quantity", ""))
            fields[f"rack{i}_rate"]  = str(rack.get("quote_price", ""))
            fields[f"rack{i}_price"] = str(round(rp, 2))
        for i in range(len(my_racks[:2]) + 1, 3):
            fields[f"rack{i}_dim"] = ""
            fields[f"rack{i}_qty"] = ""
            fields[f"rack{i}_rate"] = ""
            fields[f"rack{i}_price"] = ""

        # custom cost slots (max 5)
        for i, cc in enumerate(my_customs[:5], start=1):
            cp = float(cc.get("quote_price", 0)) * int(cc.get("quantity", 1))
            fields[f"cc{i}_desc"]  = str(cc.get("modular_rack", ""))
            fields[f"cc{i}_price"] = str(round(cp, 2))
        for i in range(len(my_customs[:5]) + 1, 6):
            fields[f"cc{i}_desc"]  = ""
            fields[f"cc{i}_price"] = ""

        with _conn(db_path) as conn:
            row = conn.execute(
                'SELECT sr_no FROM inquiry WHERE quote_code = ? AND sol_no = ?',
                (quote_code, sol_no)
            ).fetchone()
            if row:
                sets = ", ".join(f'"{f}" = ?' for f in fields)
                conn.execute(
                    f'UPDATE inquiry SET {sets} WHERE quote_code = ? AND sol_no = ?',
                    [fields[f] for f in fields] + [quote_code, sol_no]
                )


def create_from_completion(inquiry_code: str, exports: list, pending_row: dict):
    """Create/update global inquiry rows from completed pending export history."""
    init_inquiry_db()

    _QUOTE_FIELDS = [
        "ups_kva", "part_code", "cell_type", "ageing_type", "backup_time_min",
        "centre_tap", "quote_code", "qty_system", "rate_system", "price_system",
        "sales_person", "solution_provider", "project_customer",
        "rack1_dim", "rack1_qty", "rack1_rate", "rack1_price",
        "rack2_dim", "rack2_qty", "rack2_rate", "rack2_price",
        "cc1_desc", "cc1_price", "cc2_desc", "cc2_price", "cc3_desc", "cc3_price",
        "cc4_desc", "cc4_price", "cc5_desc", "cc5_price",
        "dollar_rate", "base_partcode", "quote_format",
    ]
    _SIZING_FIELDS = [
        "ups_make", "ups_model", "actual_load_kva", "load_kw", "power_factor",
        "inverter_efficiency", "dc_voltage", "backup_min", "cell_chemistry",
        "ageing_pct", "design_margin_pct", "dod_margin_pct", "derating_pct", "capacity_ah",
    ]

    quote_exports  = [e for e in exports if e.get("export_type", "").startswith("quote_")]
    sizing_exports = [e for e in exports if e.get("export_type", "").startswith("sizing_")]
    ds_exports     = [e for e in exports if e.get("export_type") == "datasheet"]
    gad_exports    = [e for e in exports if e.get("export_type") == "gad"]

    sol_nos = list(dict.fromkeys(
        e.get("sol_no", "") for e in quote_exports if e.get("sol_no", "")
    ))
    if not sol_nos and quote_exports:
        for e in quote_exports:
            e["sol_no"] = "1"
        sol_nos = ["1"]
    sol_nos.sort(key=lambda s: int(s) if s.isdigit() else s)

    _pending_base = {
        "inquiry_code":    inquiry_code,
        "inquiry_date":    str(pending_row.get("received_date", "") or ""),
        "submission_date": str(pending_row.get("submission_date", "") or ""),
        "submitted_to":    str(pending_row.get("submitted_to", "") or ""),
        "submitted_by":    str(pending_row.get("submitted_by", "") or ""),
        "handled_by":      str(pending_row.get("assigned_to", "") or ""),
    }

    def _insert(gc, row_data: dict):
        ins = {k: v for k, v in row_data.items() if k in _COLS and k != "sr_no"}
        ins["created_at"] = int(time.time() * 1000)
        ins["sr_no"] = (gc.execute('SELECT MAX(sr_no) FROM inquiry').fetchone()[0] or 0) + 1
        valid = [k for k in ins if k in _COLS]
        cols_sql = ", ".join('"' + c + '"' for c in valid)
        ph = ", ".join("?" * len(valid))
        gc.execute(f'INSERT INTO inquiry ({cols_sql}) VALUES ({ph})', [ins[k] for k in valid])

    with _conn() as gc:
        # ── one system row per sol_no from quote exports ──
        for sol_no in sol_nos:
            sol_quotes = sorted(
                [e for e in quote_exports if e.get("sol_no") == sol_no],
                key=lambda e: e.get("exported_at", 0), reverse=True,
            )
            if not sol_quotes:
                continue
            latest_q = sol_quotes[0]
            quote_data = {f: str(latest_q.get(f, "") or "") for f in _QUOTE_FIELDS}
            if latest_q.get("warranty_years"):
                quote_data["warranty"] = str(latest_q["warranty_years"])

            # priority: linked sizing child > tech fields on quote export > nothing
            linked_sz = sorted(
                [e for e in sizing_exports if e.get("sol_no") == sol_no],
                key=lambda e: e.get("exported_at", 0), reverse=True,
            )
            quote_has_tech = any(str(latest_q.get(f, "") or "").strip() for f in _SIZING_FIELDS)

            if linked_sz:
                sizing_data = {f: str(linked_sz[0].get(f, "") or "") for f in _SIZING_FIELDS}
                sz_flag = "YES"
            elif quote_has_tech:
                sizing_data = {f: str(latest_q.get(f, "") or "") for f in _SIZING_FIELDS}
                sz_flag = "YES"
            else:
                sizing_data = {}
                sz_flag = "NO"

            ds_flag  = "YES" if any(e.get("sol_no") == sol_no for e in ds_exports)  else "NO"
            gad_flag = "YES" if any(e.get("sol_no") == sol_no for e in gad_exports) else "NO"

            base_type = str(latest_q.get("type", "") or "")
            row_data = {
                **_pending_base, **sizing_data, **quote_data,
                "sol_no": sol_no,
                "type": f"{base_type} - Sol {sol_no}" if base_type else f"Sol {sol_no}",
                "datasheet": ds_flag, "gad": gad_flag, "sizing_sheet": sz_flag,
            }

            existing = gc.execute(
                'SELECT sr_no FROM inquiry WHERE quote_code = ? AND sol_no = ?',
                (row_data.get("quote_code", ""), sol_no)
            ).fetchone()
            if existing:
                fields = [k for k in row_data if k in _COLS and k not in ("sr_no", "created_at")]
                sets = ", ".join(f'"{f}" = ?' for f in fields)
                gc.execute(
                    f'UPDATE inquiry SET {sets} WHERE quote_code = ? AND sol_no = ?',
                    [row_data[f] for f in fields] + [row_data.get("quote_code", ""), sol_no]
                )
            else:
                _insert(gc, row_data)

        def _is_standalone(e):
            s = e.get("sol_no", "")
            return not s or s == "standalone"

        # ── unlinked / standalone datasheets → own row ──
        for e in ds_exports:
            if not _is_standalone(e):
                continue
            fname = str(e.get("datasheet_name", "") or "").strip()
            if fname:
                _insert(gc, {**_pending_base, "type": "Datasheet", "part_code": fname})

        # ── unlinked / standalone GADs → own row ──
        for e in gad_exports:
            if not _is_standalone(e):
                continue
            fname = str(e.get("gad_name", "") or "").strip()
            if fname:
                _insert(gc, {**_pending_base, "type": "GAD", "part_code": fname})

        # ── unlinked / standalone sizing → one row per unique fingerprint ──
        def _sz_fp(e):
            return tuple(str(e.get(f, "") or "") for f in _SIZING_FIELDS)

        seen: set = set()
        for e in sorted(sizing_exports, key=lambda x: x.get("exported_at", 0), reverse=True):
            if not _is_standalone(e):
                continue
            fp = _sz_fp(e)
            if fp in seen:
                continue
            seen.add(fp)
            _insert(gc, {
                **_pending_base,
                "type": "Sizing",
                **{f: str(e.get(f, "") or "") for f in _SIZING_FIELDS},
            })


def push_to_global(quote_code: str, user_db_path: str):
    """Upsert all inquiry rows for quote_code from user DB into global DB."""
    init_inquiry_db(user_db_path)
    init_inquiry_db()

    with _conn(user_db_path) as uc:
        col_info = uc.execute('PRAGMA table_info(inquiry)').fetchall()
        db_cols = [r[1] for r in col_info]
        rows = uc.execute('SELECT * FROM inquiry WHERE quote_code = ?', (quote_code,)).fetchall()
        if not rows:
            return
        rows = [dict(zip(db_cols, r)) for r in rows]

    with _conn() as gc:
        for data in rows:
            sol_no = data.get('sol_no')
            existing = gc.execute(
                'SELECT sr_no FROM inquiry WHERE quote_code = ? AND sol_no = ?',
                (quote_code, sol_no)
            ).fetchone()
            if existing:
                fields = {k: data[k] for k in data if k in _COLS and k not in ('sr_no', 'created_at')}
                sets = ', '.join(f'"{f}" = ?' for f in fields)
                gc.execute(
                    f'UPDATE inquiry SET {sets} WHERE quote_code = ? AND sol_no = ?',
                    list(fields.values()) + [quote_code, sol_no]
                )
            else:
                insert_data = {k: data[k] for k in data if k in _COLS and k != 'sr_no'}
                insert_data['created_at'] = int(time.time() * 1000)
                max_sr = gc.execute('SELECT MAX(sr_no) FROM inquiry').fetchone()[0]
                insert_data['sr_no'] = (max_sr or 0) + 1
                valid = [k for k in insert_data if k in _COLS]
                ph = ', '.join('?' * len(valid))
                qs = ', '.join(f'"{c}"' for c in valid)
                gc.execute(f'INSERT INTO inquiry ({qs}) VALUES ({ph})', [insert_data[k] for k in valid])

