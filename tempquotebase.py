import sqlite3
import os
import sys

def get_db_connection(db_path=None):
    if db_path:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode = OFF;")
        return conn
    if getattr(sys, 'frozen', False):
        path = os.path.join(os.path.dirname(sys.executable), 'temp.db')
    else:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp.db')
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode = OFF;")
    return conn

def init_temp_db(db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS active_quotes (
               code text PRIMARY KEY,
               date text,
               customer_name text,
               solution_provider text,
               format text,
               sales_person text DEFAULT ''
              )""")
    conn.commit()
    # migrate existing DBs that lack the column
    try:
        c.execute("ALTER TABLE active_quotes ADD COLUMN sales_person text DEFAULT ''")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # column already exists
    conn.close()

# Initialize on import (desktop app path)
init_temp_db()

def sanitize_code(code):
    return "".join(c for c in code if c.isalnum() or c in ('_',)).rstrip()

def get_items_table_name(code):
    return f"items_{sanitize_code(code)}"

def create_quote_table(code, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    table_name = get_items_table_name(code)
    c.execute(f"""CREATE TABLE IF NOT EXISTS {table_name} (
               "code" text,
               "format" text,
               "date" text,
               "solution_provider" text,
               "customer_name" text,
               "sr_no" int,
               "sol_no" int,
               "ups_rating" int,
               "backup_requirement" int,
               "calc_load" int,
               "celltype" text,
               "centre_tapping" text,
               "batterypartcode" text,
               "backup_time" int,
               "quantity" int,
               "quote_price" int,
               "modular_rack" text
              )""")
    conn.commit()
    conn.close()

def add_new_quote(code, date, customer_name, solution_provider, format_template, db_path=None, sales_person=""):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO active_quotes (code, date, customer_name, solution_provider, format, sales_person) VALUES (?, ?, ?, ?, ?, ?)",
                  (code, date, customer_name, solution_provider, format_template, sales_person))
        conn.commit()
    except sqlite3.IntegrityError:
        c.execute("UPDATE active_quotes SET date=?, customer_name=?, solution_provider=?, format=?, sales_person=? WHERE code=?",
                  (date, customer_name, solution_provider, format_template, sales_person, code))
        conn.commit()
    conn.close()
    create_quote_table(code, db_path)

def get_all_quotes(db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    c.execute("SELECT * FROM active_quotes")
    quotes = c.fetchall()
    conn.close()
    return quotes

def delete_quote(code, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    c.execute("DELETE FROM active_quotes WHERE code=?", (code,))
    table_name = get_items_table_name(code)
    c.execute(f"DROP TABLE IF EXISTS {table_name}")
    conn.commit()
    conn.close()

def add_product_quote(quote_code, code, format, date, solution_provider, customer_name,
                      sr_no, sol_no, ups_rating, backup_requirement, calc_load,
                      celltype, centre_tapping, batterypartcode, backup_time,
                      quantity, quote_price, modular_rack, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    table_name = get_items_table_name(quote_code)
    c.execute(f"""CREATE TABLE IF NOT EXISTS {table_name} (
               "code" text,
               "format" text,
               "date" text,
               "solution_provider" text,
               "customer_name" text,
               "sr_no" int,
               "sol_no" int,
               "ups_rating" int,
               "backup_requirement" int,
               "calc_load" int,
               "celltype" text,
               "centre_tapping" text,
               "batterypartcode" text,
               "backup_time" int,
               "quantity" int,
               "quote_price" int,
               "modular_rack" text
              )""")
    c.execute(f'''INSERT INTO {table_name} (code, format, date, solution_provider, customer_name,
                sr_no, sol_no, ups_rating, backup_requirement, calc_load, celltype,
                centre_tapping, batterypartcode, backup_time, quantity, quote_price, modular_rack)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
              (code, format, date, solution_provider, customer_name, sr_no, sol_no,
               ups_rating, backup_requirement, calc_load, celltype,
               centre_tapping, batterypartcode, backup_time, quantity,
               quote_price, modular_rack))
    conn.commit()
    conn.close()

def clear_quotedata_table(quote_code, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    table_name = get_items_table_name(quote_code)
    try:
        c.execute(f'DELETE FROM {table_name}')
        conn.commit()
    except Exception:
        pass
    conn.close()

def delete_product_quote(quote_code, sr_no, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    table_name = get_items_table_name(quote_code)
    try:
        c.execute(f'DELETE FROM {table_name} WHERE sr_no = ?', (sr_no,))
        conn.commit()
    except Exception:
        pass
    conn.close()

def get_all_quote_products(quote_code, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    table_name = get_items_table_name(quote_code)
    try:
        c.execute(f'SELECT * FROM {table_name}')
        rows = c.fetchall()
    except Exception as e:
        print(f"Error fetching products for {quote_code}: {e}")
        rows = []
    conn.close()
    return rows

def get_highest_sr_no(quote_code, db_path=None):
    conn = get_db_connection(db_path)
    c = conn.cursor()
    table_name = get_items_table_name(quote_code)
    try:
        c.execute(f'SELECT MAX(sr_no) FROM {table_name}')
        result = c.fetchone()
        val = result[0] if result[0] is not None else 0
    except Exception:
        val = 0
    conn.close()
    return val
