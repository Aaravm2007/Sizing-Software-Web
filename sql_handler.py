import sqlite3
import os
import sys

def get_connection(db_path=None):
    if db_path:
        return sqlite3.connect(db_path)
    if getattr(sys, 'frozen', False):
        db_path = os.path.join(os.path.dirname(sys.executable), "sizing.db")
    else:
        db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sizing.db")
    return sqlite3.connect(db_path)


# -------------------------------------------------
# INIT (AUTO-CREATE TABLE)
# -------------------------------------------------

def init_sizing_db(table_name, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS "{table_name}" (
            sr_no INTEGER PRIMARY KEY,
            customer_name TEXT,
            solution_provider TEXT,
            ups_make TEXT,
            ups_model TEXT,
            ups_rating_kva REAL,
            actual_load_kva REAL,
            actual_load_kw REAL,
            power_factor REAL,
            inverter_efficiency REAL,
            nominal_dc_voltage REAL,
            backup_requirement_min REAL,
            ageing_fraction REAL,
            design_margin_percent REAL,
            dod_margin_percent REAL,
            derating_factor_percent REAL,
            number_of_cells INTEGER,
            cell_chemistry TEXT,
            calculated_load_kw REAL,
            max_charging_voltage REAL,
            end_cell_voltage REAL,
            energy_required_kwh REAL,
            capacity_required_ah REAL,
            cap_with_ageing_ah REAL,
            cap_with_design_margin_ah REAL,
            cap_with_dod_margin_ah REAL,
            cap_with_derating_factor_ah REAL,
            nearest_capacity_ah REAL,
            offered_battery_config TEXT,
            total_available_energy_kwh REAL,
            backup_time_min REAL,
            ageing_type TEXT DEFAULT 'BOL',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Check if ageing_type column exists (for upgrading existing tables)
    cur.execute(f"PRAGMA table_info(\"{table_name}\")")
    columns = [row[1] for row in cur.fetchall()]
    if 'ageing_type' not in columns:
        cur.execute(f"ALTER TABLE \"{table_name}\" ADD COLUMN ageing_type TEXT DEFAULT 'BOL'")
    if 'cap_with_ageing_ah' not in columns:
        cur.execute(f"ALTER TABLE \"{table_name}\" ADD COLUMN cap_with_ageing_ah REAL")

    conn.commit()
    conn.close()


def validate_table(cur, table_name):
    cur.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type='table'
          AND name = ?;
    """, (table_name,))
    if cur.fetchone() is None:
        raise ValueError(f"Invalid table name: {table_name}")



# -------------------------------------------------
# HELPERS
# -------------------------------------------------

def get_next_sr_no(cur, table_name):
    validate_table(cur, table_name)
    cur.execute(f'SELECT COALESCE(MAX(sr_no), 0) + 1 FROM "{table_name}"')
    return cur.fetchone()[0]


def renumber_sr_no(cur, table_name):
    validate_table(cur, table_name)
    cur.execute(f"""
        WITH ordered AS (
            SELECT sr_no, ROW_NUMBER() OVER (ORDER BY sr_no) AS new_sr
            FROM "{table_name}"
        )
        UPDATE "{table_name}"
        SET sr_no = (
            SELECT new_sr
            FROM ordered
            WHERE ordered.sr_no = "{table_name}".sr_no
        )
    """)

def fetch_max_sr_no(table_name, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    cur.execute(f'SELECT COALESCE(MAX(sr_no), 0) FROM "{table_name}"')
    max_sr_no = cur.fetchone()[0]
    conn.close()
    return max_sr_no

# -------------------------------------------------
# FETCH
# -------------------------------------------------

def fetch_all_sizings(table_name, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    cur.execute(f"""
        SELECT sr_no, offered_battery_config
        FROM "{table_name}"
        ORDER BY sr_no
    """)

    rows = cur.fetchall()
    conn.close()
    return rows



def fetch_sizing_by_sr(table_name, sr_no, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    cur.execute(f"""
        SELECT
            sr_no,
            customer_name,
            solution_provider,
            ups_make,
            ups_model,
            ups_rating_kva,
            actual_load_kva,
            actual_load_kw,
            power_factor,
            inverter_efficiency,
            nominal_dc_voltage,
            backup_requirement_min,
            ageing_fraction,
            design_margin_percent,
            dod_margin_percent,
            derating_factor_percent,
            number_of_cells,
            cell_chemistry,
            calculated_load_kw,
            max_charging_voltage,
            end_cell_voltage,
            energy_required_kwh,
            capacity_required_ah,
            cap_with_ageing_ah,
            cap_with_design_margin_ah,
            cap_with_dod_margin_ah,
            cap_with_derating_factor_ah,
            nearest_capacity_ah,
            offered_battery_config,
            total_available_energy_kwh,
            backup_time_min,
            ageing_type,
            created_at
        FROM "{table_name}"
        WHERE sr_no=?
    """, (sr_no,))

    row = cur.fetchone()
    conn.close()
    return row

def fetch_all_projects(db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    cur.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type='table'
          AND name NOT LIKE 'sqlite_%';
    """)
    tables = [row[0] for row in cur.fetchall()]
    conn.close()
    return tables

# -------------------------------------------------
# INSERT
# -------------------------------------------------

def insert_sizing(table_name, data, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    sr_no = get_next_sr_no(cur, table_name)

    cur.execute(f"""
        INSERT INTO "{table_name}" (
            sr_no,
            customer_name,
            solution_provider,
            ups_make,
            ups_model,
            ups_rating_kva,
            actual_load_kva,
            actual_load_kw,
            power_factor,
            inverter_efficiency,
            nominal_dc_voltage,
            backup_requirement_min,
            ageing_fraction,
            design_margin_percent,
            dod_margin_percent,
            derating_factor_percent,
            number_of_cells,
            cell_chemistry,
            calculated_load_kw,
            max_charging_voltage,
            end_cell_voltage,
            energy_required_kwh,
            capacity_required_ah,
            cap_with_ageing_ah,
            cap_with_design_margin_ah,
            cap_with_dod_margin_ah,
            cap_with_derating_factor_ah,
            nearest_capacity_ah,
            offered_battery_config,
            total_available_energy_kwh,
            backup_time_min,
            ageing_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        sr_no,
        data["Customer Name"],
        data["Solution Provider"],
        data["UPS Make"],
        data["UPS Model"],
        data["UPS Rating (KVA)"],
        data["Actual Load (KVA)"],
        data["Actual Load (kW)"],
        data["Power Factor"],
        data["Inverter Efficiency"],
        data["Nominal DC Voltage (V)"],
        data["Backup Requirement (Min)"],
        data["Ageing (%)"],
        data["Design Margin (%)"],
        data["DOD Margin (%)"],
        data["Derating Factor (%)"],
        data["Number of Cells"],
        data["Cell Chemistry"],
        data["Calculated Load (kW)"],
        data["Max Charging Voltage (V)"],
        data["End Cell Voltage (V)"],
        data["Energy Required (kWh)"],
        data["Capacity Required (Ah)"],
        data.get("Cap req w/ Ageing (Ah)", None),
        data["Cap req w/ Design Margin (Ah)"],
        data["Cap req w/ DOD (Ah)"],
        data["Cap req w/ Derating (Ah)"],
        data["Nearest Available Capacity (Ah)"],
        data["Offered Battery Configuration"],
        data["Total Available Energy (kWh)"],
        data["Backup Time (Min)"],
        data.get("Ageing Type", "BOL")
    ))

    conn.commit()
    conn.close()
    return sr_no

def duplicate_sizing(table_name, sr_no, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)
    
    new_sr_no = get_next_sr_no(cur, table_name)
    
    cur.execute(f"""
        INSERT INTO "{table_name}" (
            sr_no, customer_name, solution_provider, ups_make, ups_model, ups_rating_kva,
            actual_load_kva, actual_load_kw, power_factor, inverter_efficiency, nominal_dc_voltage,
            backup_requirement_min, ageing_fraction, design_margin_percent, dod_margin_percent, derating_factor_percent, number_of_cells, cell_chemistry,
            calculated_load_kw, max_charging_voltage, end_cell_voltage, energy_required_kwh,
            capacity_required_ah, cap_with_ageing_ah, cap_with_design_margin_ah, cap_with_dod_margin_ah, cap_with_derating_factor_ah, nearest_capacity_ah, offered_battery_config,
            total_available_energy_kwh, backup_time_min, ageing_type
        )
        SELECT
            ?, customer_name, solution_provider, ups_make, ups_model, ups_rating_kva,
            actual_load_kva, actual_load_kw, power_factor, inverter_efficiency, nominal_dc_voltage,
            backup_requirement_min, ageing_fraction, design_margin_percent, dod_margin_percent, derating_factor_percent, number_of_cells, cell_chemistry,
            calculated_load_kw, max_charging_voltage, end_cell_voltage, energy_required_kwh,
            capacity_required_ah, cap_with_ageing_ah, cap_with_design_margin_ah, cap_with_dod_margin_ah, cap_with_derating_factor_ah, nearest_capacity_ah, offered_battery_config,
            total_available_energy_kwh, backup_time_min, ageing_type
        FROM "{table_name}"
        WHERE sr_no = ?
    """, (new_sr_no, sr_no))
    
    conn.commit()
    conn.close()




# -------------------------------------------------
# UPDATE
# -------------------------------------------------

def update_sizing(table_name, sr_no, data, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    cur.execute(f"""
        UPDATE "{table_name}" SET
            customer_name=?,
            solution_provider=?,
            ups_make=?,
            ups_model=?,
            ups_rating_kva=?,
            actual_load_kva=?,
            actual_load_kw=?,
            power_factor=?,
            inverter_efficiency=?,
            nominal_dc_voltage=?,
            backup_requirement_min=?,
            ageing_fraction=?,
            design_margin_percent=?,
            dod_margin_percent=?,
            derating_factor_percent=?,
            number_of_cells=?,
            cell_chemistry=?,
            calculated_load_kw=?,
            max_charging_voltage=?,
            end_cell_voltage=?,
            energy_required_kwh=?,
            capacity_required_ah=?,
            cap_with_ageing_ah=?,
            cap_with_design_margin_ah=?,
            cap_with_dod_margin_ah=?,
            cap_with_derating_factor_ah=?,
            nearest_capacity_ah=?,
            offered_battery_config=?,
            total_available_energy_kwh=?,
            backup_time_min=?,
            ageing_type=?
        WHERE sr_no=?
    """, (
        data["Customer Name"],
        data["Solution Provider"],
        data["UPS Make"],
        data["UPS Model"],
        data["UPS Rating (KVA)"],
        data["Actual Load (KVA)"],
        data["Actual Load (kW)"],
        data["Power Factor"],
        data["Inverter Efficiency"],
        data["Nominal DC Voltage (V)"],
        data["Backup Requirement (Min)"],
        data["Ageing (%)"],
        data["Design Margin (%)"],
        data["DOD Margin (%)"],
        data["Derating Factor (%)"],
        data["Number of Cells"],
        data["Cell Chemistry"],
        data["Calculated Load (kW)"],
        data["Max Charging Voltage (V)"],
        data["End Cell Voltage (V)"],
        data["Energy Required (kWh)"],
        data["Capacity Required (Ah)"],
        data.get("Cap req w/ Ageing (Ah)", None),
        data["Cap req w/ Design Margin (Ah)"],
        data["Cap req w/ DOD (Ah)"],
        data["Cap req w/ Derating (Ah)"],
        data["Nearest Available Capacity (Ah)"],
        data["Offered Battery Configuration"],
        data["Total Available Energy (kWh)"],
        data["Backup Time (Min)"],
        data.get("Ageing Type", "BOL"),
        sr_no
    ))

    conn.commit()
    conn.close()



# -------------------------------------------------
# DELETE
# -------------------------------------------------

def delete_sizing(table_name, sr_no, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    cur.execute(f'DELETE FROM "{table_name}" WHERE sr_no=?', (sr_no,))
    renumber_sr_no(cur, table_name)

    conn.commit()
    conn.close()

def delete_project(table_name, db_path=None):
    conn = get_connection(db_path)
    cur = conn.cursor()
    validate_table(cur, table_name)

    cur.execute(f"""
        DROP TABLE IF EXISTS "{table_name}"
    """)

    conn.commit()
    conn.close()