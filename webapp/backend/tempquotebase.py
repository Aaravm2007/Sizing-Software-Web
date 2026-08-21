from pathlib import Path

from pg import get_conn, dict_cur

# db_path values are legacy per-user sqlite paths (data/{username}/temp.db or
# wizard_temp.db), now used only as scope tokens mapping to
# (username, scope) rows in the shared active_quotes / quote_items tables.


def _scope(db_path=None):
    if not db_path:
        return "", "normal"
    p = Path(db_path)
    return p.parent.name, ("wizard" if p.name.startswith("wizard") else "normal")


def _txt(v):
    return v if v is None or isinstance(v, str) else str(v)


def _num(v, cast):
    if v is None or v == "":
        return None
    try:
        return cast(v)
    except (TypeError, ValueError):
        return None


# Column order callers rely on when unpacking tuples (matches the legacy
# sqlite table layouts consumed by quotation.py's _row_to_dict).
_AQ_COLS = ["code", "date", "customer_name", "solution_provider", "format",
            "sales_person", "dollar_rate", "warranty_years"]
_QI_COLS = ["code", "format", "date", "solution_provider", "customer_name",
            "sr_no", "sol_no", "ups_rating", "backup_requirement", "calc_load",
            "celltype", "centre_tapping", "batterypartcode", "backup_time",
            "quantity", "quote_price", "modular_rack", "system_text", "solution_text",
            "calc_load_unit", "item_type", "ageing_type", "original_price"]
_QI_SELECT = ", ".join(f'"{c}"' for c in _QI_COLS)


def init_temp_db(db_path=None):
    """Schema is created by pg.init_all_tables(); kept for call-site compatibility."""


def add_new_quote(code, date, customer_name, solution_provider, format_template, db_path=None,
                  sales_person="", dollar_rate="", warranty_years="5"):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        conn.cursor().execute(
            """INSERT INTO active_quotes
               (username, scope, code, date, customer_name, solution_provider, format,
                sales_person, dollar_rate, warranty_years)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (username, scope, code) DO UPDATE SET
                 date = excluded.date, customer_name = excluded.customer_name,
                 solution_provider = excluded.solution_provider, format = excluded.format,
                 sales_person = excluded.sales_person, dollar_rate = excluded.dollar_rate,
                 warranty_years = excluded.warranty_years""",
            (username, scope, code, date, customer_name, solution_provider,
             format_template, sales_person, dollar_rate, str(warranty_years)),
        )


def get_all_quotes(db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f'SELECT {", ".join(_AQ_COLS)} FROM active_quotes'
            ' WHERE username = %s AND scope = %s ORDER BY id',
            (username, scope),
        )
        return cur.fetchall()


def delete_quote(code, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM active_quotes WHERE username = %s AND scope = %s AND code = %s",
                    (username, scope, code))
        cur.execute("DELETE FROM quote_items WHERE username = %s AND scope = %s AND quote_code = %s",
                    (username, scope, code))


def add_product_quote(quote_code, code, format, date, solution_provider, customer_name,
                      sr_no, sol_no, ups_rating, backup_requirement, calc_load,
                      celltype, centre_tapping, batterypartcode, backup_time,
                      quantity, quote_price, modular_rack, calc_load_unit="kW",
                      item_type="system", ageing_type="BOL", db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        conn.cursor().execute(
            """INSERT INTO quote_items
               (username, scope, quote_code, code, format, date, solution_provider, customer_name,
                sr_no, sol_no, ups_rating, backup_requirement, calc_load, calc_load_unit,
                celltype, centre_tapping, batterypartcode, backup_time, quantity, quote_price,
                modular_rack, item_type, ageing_type)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (username, scope, quote_code, _txt(code), _txt(format), _txt(date),
             _txt(solution_provider), _txt(customer_name),
             _num(sr_no, int), _txt(sol_no), _txt(ups_rating), _txt(backup_requirement),
             _txt(calc_load), _txt(calc_load_unit), _txt(celltype), _txt(centre_tapping),
             _txt(batterypartcode), _txt(backup_time), _num(quantity, int),
             _num(quote_price, float), _txt(modular_rack), _txt(item_type), _txt(ageing_type)),
        )


def clear_quotedata_table(quote_code, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        conn.cursor().execute(
            "DELETE FROM quote_items WHERE username = %s AND scope = %s AND quote_code = %s",
            (username, scope, quote_code),
        )


def delete_product_quote(quote_code, sr_no, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        conn.cursor().execute(
            "DELETE FROM quote_items WHERE username = %s AND scope = %s AND quote_code = %s AND sr_no = %s",
            (username, scope, quote_code, sr_no),
        )


def get_all_quote_products(quote_code, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f'SELECT {_QI_SELECT} FROM quote_items'
            ' WHERE username = %s AND scope = %s AND quote_code = %s ORDER BY sr_no',
            (username, scope, quote_code),
        )
        return cur.fetchall()


def get_highest_sr_no(quote_code, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT COALESCE(MAX(sr_no), 0) FROM quote_items"
            " WHERE username = %s AND scope = %s AND quote_code = %s",
            (username, scope, quote_code),
        )
        return cur.fetchone()[0]


# ── helpers for routers/quotation.py (former raw-sqlite blocks) ───────────────

def update_quote_meta(code, date, customer_name, solution_provider, format_template,
                      sales_person, dollar_rate, warranty_years, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        conn.cursor().execute(
            """UPDATE active_quotes SET customer_name=%s, solution_provider=%s, sales_person=%s,
               date=%s, format=%s, dollar_rate=%s, warranty_years=%s
               WHERE username=%s AND scope=%s AND code=%s""",
            (customer_name, solution_provider, sales_person, date, format_template,
             dollar_rate, str(warranty_years), username, scope, code),
        )


def rename_quote(code, new_code, db_path=None) -> bool:
    """Rename a quote code. Returns False if new_code already exists in this scope."""
    username, scope = _scope(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM active_quotes WHERE username=%s AND scope=%s AND code=%s",
                    (username, scope, new_code))
        if cur.fetchone():
            return False
        cur.execute("UPDATE active_quotes SET code=%s WHERE username=%s AND scope=%s AND code=%s",
                    (new_code, username, scope, code))
        cur.execute(
            "UPDATE quote_items SET quote_code=%s, code=%s WHERE username=%s AND scope=%s AND quote_code=%s",
            (new_code, new_code, username, scope, code),
        )
        return True


def update_item_fields(quote_code, sr_no, fields: dict, db_path=None):
    username, scope = _scope(db_path)
    fields = {k: v for k, v in fields.items() if k in _QI_COLS and k != "sr_no"}
    if not fields:
        return
    coerced = {
        k: (_num(v, int) if k == "quantity" else _num(v, float) if k in ("quote_price", "original_price") else _txt(v))
        for k, v in fields.items()
    }
    sets = ", ".join(f'"{k}" = %s' for k in coerced)
    with get_conn() as conn:
        conn.cursor().execute(
            f'UPDATE quote_items SET {sets}'
            ' WHERE username = %s AND scope = %s AND quote_code = %s AND sr_no = %s',
            list(coerced.values()) + [username, scope, quote_code, sr_no],
        )


def revert_discount(quote_code, sr_no, db_path=None):
    """Restore quote_price from original_price and clear original_price.
    No-op if the item has no discount applied (original_price is NULL)."""
    username, scope = _scope(db_path)
    with get_conn() as conn:
        conn.cursor().execute(
            """UPDATE quote_items SET quote_price = original_price, original_price = NULL
               WHERE username = %s AND scope = %s AND quote_code = %s AND sr_no = %s
                 AND original_price IS NOT NULL""",
            (username, scope, quote_code, sr_no),
        )


def reorder_quote_items(quote_code, sr_nos: list, db_path=None):
    username, scope = _scope(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        for i, sr in enumerate(sr_nos):
            cur.execute(
                "UPDATE quote_items SET sr_no = %s"
                " WHERE username = %s AND scope = %s AND quote_code = %s AND sr_no = %s",
                (-(i + 1), username, scope, quote_code, sr),
            )
        for i in range(len(sr_nos)):
            cur.execute(
                "UPDATE quote_items SET sr_no = %s"
                " WHERE username = %s AND scope = %s AND quote_code = %s AND sr_no = %s",
                (i + 1, username, scope, quote_code, -(i + 1)),
            )
