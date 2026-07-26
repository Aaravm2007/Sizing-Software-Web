from pathlib import Path

from pg import get_conn

# db_path values are legacy per-user sqlite paths (data/{username}/sizing.db),
# now used only as scope tokens; each legacy table-per-project becomes rows in
# the shared sizings table keyed by (username, project_name).

# column order callers rely on when unpacking fetch_sizing_by_sr tuples
_FIELDS = [
    "sr_no", "customer_name", "solution_provider", "ups_make", "ups_model",
    "ups_rating_kva", "actual_load_kva", "actual_load_kw", "power_factor",
    "inverter_efficiency", "nominal_dc_voltage", "backup_requirement_min",
    "ageing_fraction", "design_margin_percent", "dod_margin_percent",
    "derating_factor_percent", "number_of_cells", "cell_chemistry",
    "calculated_load_kw", "max_charging_voltage", "end_cell_voltage",
    "energy_required_kwh", "capacity_required_ah", "cap_with_ageing_ah",
    "cap_with_design_margin_ah", "cap_with_dod_margin_ah",
    "cap_with_derating_factor_ah", "nearest_capacity_ah",
    "offered_battery_config", "total_available_energy_kwh", "backup_time_min",
    "ageing_type",
]

# data-dict keys in insert/update order (parallel to _FIELDS[1:])
_DATA_KEYS = [
    "Customer Name", "Solution Provider", "UPS Make", "UPS Model",
    "UPS Rating (KVA)", "Actual Load (KVA)", "Actual Load (kW)", "Power Factor",
    "Inverter Efficiency", "Nominal DC Voltage (V)", "Backup Requirement (Min)",
    "Ageing (%)", "Design Margin (%)", "DOD Margin (%)", "Derating Factor (%)",
    "Number of Cells", "Cell Chemistry", "Calculated Load (kW)",
    "Max Charging Voltage (V)", "End Cell Voltage (V)", "Energy Required (kWh)",
    "Capacity Required (Ah)", "Cap req w/ Ageing (Ah)", "Cap req w/ Design Margin (Ah)",
    "Cap req w/ DOD (Ah)", "Cap req w/ Derating (Ah)", "Nearest Available Capacity (Ah)",
    "Offered Battery Configuration", "Total Available Energy (kWh)", "Backup Time (Min)",
]


def _user(db_path=None) -> str:
    return "" if db_path is None else Path(db_path).parent.name


def _values(data: dict) -> list:
    return [data.get(k) if k in ("Cap req w/ Ageing (Ah)",) else data[k] for k in _DATA_KEYS] + [
        data.get("Ageing Type", "BOL")
    ]


def init_sizing_db(table_name, db_path=None):
    with get_conn() as conn:
        conn.cursor().execute(
            "INSERT INTO sizing_projects (username, project_name) VALUES (%s, %s)"
            " ON CONFLICT (username, project_name) DO NOTHING",
            (_user(db_path), table_name),
        )


def validate_table(cur, table_name, username):
    cur.execute(
        "SELECT 1 FROM sizing_projects WHERE username = %s AND project_name = %s",
        (username, table_name),
    )
    if cur.fetchone() is None:
        raise ValueError(f"Invalid table name: {table_name}")


def _next_sr_no(cur, username, table_name) -> int:
    cur.execute(
        "SELECT COALESCE(MAX(sr_no), 0) + 1 FROM sizings WHERE username = %s AND project_name = %s",
        (username, table_name),
    )
    return cur.fetchone()[0]


def _renumber(cur, username, table_name):
    """Compact sr_no to 1..N (two-pass to dodge the unique constraint)."""
    cur.execute(
        """UPDATE sizings s SET sr_no = -o.new_sr
           FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY sr_no) AS new_sr
                 FROM sizings WHERE username = %s AND project_name = %s) o
           WHERE s.id = o.id""",
        (username, table_name),
    )
    cur.execute(
        "UPDATE sizings SET sr_no = -sr_no WHERE username = %s AND project_name = %s AND sr_no < 0",
        (username, table_name),
    )


def fetch_max_sr_no(table_name, db_path=None):
    username = _user(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        cur.execute(
            "SELECT COALESCE(MAX(sr_no), 0) FROM sizings WHERE username = %s AND project_name = %s",
            (username, table_name),
        )
        return cur.fetchone()[0]


def fetch_all_sizings(table_name, db_path=None):
    username = _user(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        cur.execute(
            "SELECT sr_no, offered_battery_config FROM sizings"
            " WHERE username = %s AND project_name = %s ORDER BY sr_no",
            (username, table_name),
        )
        return cur.fetchall()


def fetch_sizing_by_sr(table_name, sr_no, db_path=None):
    username = _user(db_path)
    cols = ", ".join(_FIELDS) + ", created_at::text"
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        cur.execute(
            f"SELECT {cols} FROM sizings"
            " WHERE username = %s AND project_name = %s AND sr_no = %s",
            (username, table_name, sr_no),
        )
        return cur.fetchone()


def fetch_all_projects(db_path=None):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT project_name FROM sizing_projects WHERE username = %s ORDER BY id",
            (_user(db_path),),
        )
        return [r[0] for r in cur.fetchall()]


def insert_sizing(table_name, data, db_path=None):
    username = _user(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        sr_no = _next_sr_no(cur, username, table_name)
        cols = ", ".join(_FIELDS)
        ph = ", ".join(["%s"] * (len(_FIELDS) + 2))
        cur.execute(
            f"INSERT INTO sizings (username, project_name, {cols}) VALUES ({ph})",
            [username, table_name, sr_no] + _values(data),
        )
        return sr_no


def duplicate_sizing(table_name, sr_no, db_path=None):
    username = _user(db_path)
    data_cols = ", ".join(_FIELDS[1:])
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        new_sr_no = _next_sr_no(cur, username, table_name)
        cur.execute(
            f"""INSERT INTO sizings (username, project_name, sr_no, {data_cols})
                SELECT username, project_name, %s, {data_cols}
                FROM sizings WHERE username = %s AND project_name = %s AND sr_no = %s""",
            (new_sr_no, username, table_name, sr_no),
        )


def update_sizing(table_name, sr_no, data, db_path=None):
    username = _user(db_path)
    sets = ", ".join(f"{f} = %s" for f in _FIELDS[1:])
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        cur.execute(
            f"UPDATE sizings SET {sets}"
            " WHERE username = %s AND project_name = %s AND sr_no = %s",
            _values(data) + [username, table_name, sr_no],
        )


def delete_sizing(table_name, sr_no, db_path=None):
    username = _user(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        cur.execute(
            "DELETE FROM sizings WHERE username = %s AND project_name = %s AND sr_no = %s",
            (username, table_name, sr_no),
        )
        _renumber(cur, username, table_name)


def delete_project(table_name, db_path=None):
    username = _user(db_path)
    with get_conn() as conn:
        cur = conn.cursor()
        validate_table(cur, table_name, username)
        cur.execute(
            "DELETE FROM sizings WHERE username = %s AND project_name = %s",
            (username, table_name),
        )
        cur.execute(
            "DELETE FROM sizing_projects WHERE username = %s AND project_name = %s",
            (username, table_name),
        )
