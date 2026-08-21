"""
Phase 1: Shared PostgreSQL connection pool.

Set PG_DSN in .env:
  PG_DSN=postgresql://user:pass@localhost:5432/sizing_db
"""
import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

import psycopg2
import psycopg2.extras
import psycopg2.pool

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        dsn = os.environ.get("PG_DSN", "")
        if not dsn:
            raise RuntimeError("PG_DSN environment variable not set")
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 20, dsn=dsn)
    return _pool


@contextmanager
def get_conn():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def dict_cur(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ── Schema ────────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS pending (
    id              SERIAL PRIMARY KEY,
    sr_no           INTEGER,
    inquiry_code    TEXT DEFAULT '',
    received_date   TEXT DEFAULT '',
    received_time   TEXT DEFAULT '',
    mail_for        TEXT DEFAULT '',
    oem_dealer      TEXT DEFAULT '',
    end_customer    TEXT DEFAULT '',
    kva_rating      TEXT DEFAULT '',
    quantity        TEXT DEFAULT '',
    backup_time     TEXT DEFAULT '',
    reply_to        TEXT DEFAULT '',
    assigned_to     TEXT DEFAULT '',
    status          TEXT DEFAULT 'pending',
    remarks         TEXT DEFAULT '',
    priority        TEXT DEFAULT 'relaxed',
    submission_date TEXT DEFAULT '',
    submitted_to    TEXT DEFAULT '',
    submitted_by    TEXT DEFAULT '',
    created_at      BIGINT,
    created_by      TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pending_items (
    id                  SERIAL PRIMARY KEY,
    username            TEXT NOT NULL DEFAULT '',
    pending_code        TEXT NOT NULL DEFAULT '',
    export_type         TEXT DEFAULT '',
    exported_at         BIGINT,
    ups_make            TEXT DEFAULT '',
    ups_model           TEXT DEFAULT '',
    ups_kva             TEXT DEFAULT '',
    actual_load_kva     TEXT DEFAULT '',
    load_kw             TEXT DEFAULT '',
    power_factor        TEXT DEFAULT '',
    inverter_efficiency TEXT DEFAULT '',
    dc_voltage          TEXT DEFAULT '',
    backup_min          TEXT DEFAULT '',
    cell_chemistry      TEXT DEFAULT '',
    ageing_pct          TEXT DEFAULT '',
    design_margin_pct   TEXT DEFAULT '',
    dod_margin_pct      TEXT DEFAULT '',
    derating_pct        TEXT DEFAULT '',
    capacity_ah         TEXT DEFAULT '',
    part_code           TEXT DEFAULT '',
    cell_type           TEXT DEFAULT '',
    ageing_type         TEXT DEFAULT '',
    backup_time_min     TEXT DEFAULT '',
    centre_tap          TEXT DEFAULT '',
    quote_code          TEXT DEFAULT '',
    qty_system          TEXT DEFAULT '',
    rate_system         TEXT DEFAULT '',
    price_system        TEXT DEFAULT '',
    sales_person        TEXT DEFAULT '',
    solution_provider   TEXT DEFAULT '',
    project_customer    TEXT DEFAULT '',
    rack_dim            TEXT DEFAULT '',
    qty                 TEXT DEFAULT '',
    per_rack_price      TEXT DEFAULT '',
    price               TEXT DEFAULT '',
    rack1_dim           TEXT DEFAULT '',
    rack1_qty           TEXT DEFAULT '',
    rack1_rate          TEXT DEFAULT '',
    rack1_price         TEXT DEFAULT '',
    rack2_dim           TEXT DEFAULT '',
    rack2_qty           TEXT DEFAULT '',
    rack2_rate          TEXT DEFAULT '',
    rack2_price         TEXT DEFAULT '',
    custom_cost_desc    TEXT DEFAULT '',
    custom_cost_price   TEXT DEFAULT '',
    cc1_desc            TEXT DEFAULT '',
    cc1_price           TEXT DEFAULT '',
    cc2_desc            TEXT DEFAULT '',
    cc2_price           TEXT DEFAULT '',
    cc3_desc            TEXT DEFAULT '',
    cc3_price           TEXT DEFAULT '',
    cc4_desc            TEXT DEFAULT '',
    cc4_price           TEXT DEFAULT '',
    cc5_desc            TEXT DEFAULT '',
    cc5_price           TEXT DEFAULT '',
    submission_date     TEXT DEFAULT '',
    submitted_to        TEXT DEFAULT '',
    datasheet_name      TEXT DEFAULT '',
    gad_name            TEXT DEFAULT '',
    cell_certificate_name TEXT DEFAULT '',
    battery_compliance_name TEXT DEFAULT '',
    remarks             TEXT DEFAULT '',
    sol_no              TEXT DEFAULT '',
    type                TEXT DEFAULT '',
    parent_id           INTEGER DEFAULT NULL,
    dollar_rate         TEXT DEFAULT '',
    warranty_years      TEXT DEFAULT '5',
    quote_format        TEXT DEFAULT '',
    base_partcode       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pending_items_code ON pending_items(username, pending_code);

CREATE TABLE IF NOT EXISTS export_history (
    id                  SERIAL PRIMARY KEY,
    inquiry_code        TEXT NOT NULL,
    exported_by         TEXT DEFAULT '',
    export_type         TEXT DEFAULT '',
    exported_at         BIGINT,
    ups_make            TEXT DEFAULT '',
    ups_model           TEXT DEFAULT '',
    ups_kva             TEXT DEFAULT '',
    actual_load_kva     TEXT DEFAULT '',
    load_kw             TEXT DEFAULT '',
    power_factor        TEXT DEFAULT '',
    inverter_efficiency TEXT DEFAULT '',
    dc_voltage          TEXT DEFAULT '',
    backup_min          TEXT DEFAULT '',
    cell_chemistry      TEXT DEFAULT '',
    ageing_pct          TEXT DEFAULT '',
    design_margin_pct   TEXT DEFAULT '',
    dod_margin_pct      TEXT DEFAULT '',
    derating_pct        TEXT DEFAULT '',
    capacity_ah         TEXT DEFAULT '',
    part_code           TEXT DEFAULT '',
    cell_type           TEXT DEFAULT '',
    ageing_type         TEXT DEFAULT '',
    backup_time_min     TEXT DEFAULT '',
    centre_tap          TEXT DEFAULT '',
    quote_code          TEXT DEFAULT '',
    qty_system          TEXT DEFAULT '',
    rate_system         TEXT DEFAULT '',
    price_system        TEXT DEFAULT '',
    sales_person        TEXT DEFAULT '',
    solution_provider   TEXT DEFAULT '',
    project_customer    TEXT DEFAULT '',
    rack_dim            TEXT DEFAULT '',
    qty                 TEXT DEFAULT '',
    per_rack_price      TEXT DEFAULT '',
    price               TEXT DEFAULT '',
    rack1_dim           TEXT DEFAULT '',
    rack1_qty           TEXT DEFAULT '',
    rack1_rate          TEXT DEFAULT '',
    rack1_price         TEXT DEFAULT '',
    rack2_dim           TEXT DEFAULT '',
    rack2_qty           TEXT DEFAULT '',
    rack2_rate          TEXT DEFAULT '',
    rack2_price         TEXT DEFAULT '',
    custom_cost_desc    TEXT DEFAULT '',
    custom_cost_price   TEXT DEFAULT '',
    cc1_desc            TEXT DEFAULT '',
    cc1_price           TEXT DEFAULT '',
    cc2_desc            TEXT DEFAULT '',
    cc2_price           TEXT DEFAULT '',
    cc3_desc            TEXT DEFAULT '',
    cc3_price           TEXT DEFAULT '',
    cc4_desc            TEXT DEFAULT '',
    cc4_price           TEXT DEFAULT '',
    cc5_desc            TEXT DEFAULT '',
    cc5_price           TEXT DEFAULT '',
    submission_date     TEXT DEFAULT '',
    submitted_to        TEXT DEFAULT '',
    datasheet_name      TEXT DEFAULT '',
    gad_name            TEXT DEFAULT '',
    cell_certificate_name TEXT DEFAULT '',
    battery_compliance_name TEXT DEFAULT '',
    remarks             TEXT DEFAULT '',
    sol_no              TEXT DEFAULT '',
    type                TEXT DEFAULT '',
    dollar_rate         TEXT DEFAULT '',
    warranty_years      TEXT DEFAULT '5',
    quote_format        TEXT DEFAULT '',
    base_partcode       TEXT DEFAULT '',
    UNIQUE(inquiry_code, exported_by, exported_at)
);
CREATE INDEX IF NOT EXISTS idx_export_history_code ON export_history(inquiry_code);

CREATE TABLE IF NOT EXISTS inquiry (
    id                  SERIAL PRIMARY KEY,
    username            TEXT NOT NULL DEFAULT '',
    sr_no               INTEGER NOT NULL,
    inquiry_code        TEXT,
    inquiry_date        TEXT,
    type                TEXT,
    sales_person        TEXT,
    solution_provider   TEXT,
    project_customer    TEXT,
    ups_make            TEXT,
    ups_model           TEXT,
    ups_kva             TEXT,
    actual_load_kva     TEXT,
    load_kw             TEXT,
    power_factor        TEXT,
    inverter_efficiency TEXT,
    dc_voltage          TEXT,
    backup_min          TEXT,
    cell_chemistry      TEXT,
    ageing_pct          TEXT,
    design_margin_pct   TEXT,
    dod_margin_pct      TEXT,
    derating_pct        TEXT,
    capacity_ah         TEXT,
    centre_tap          TEXT,
    cell_type           TEXT,
    ageing_type         TEXT,
    backup_time_min     TEXT,
    part_code           TEXT,
    qty_system          TEXT,
    rate_system         TEXT,
    price_system        TEXT,
    rack_dim            TEXT,
    qty                 TEXT,
    per_rack_price      TEXT,
    price               TEXT,
    custom_cost_desc    TEXT,
    custom_cost_price   TEXT,
    rack1_dim           TEXT,
    rack1_qty           TEXT,
    rack1_rate          TEXT,
    rack1_price         TEXT,
    rack2_dim           TEXT,
    rack2_qty           TEXT,
    rack2_rate          TEXT,
    rack2_price         TEXT,
    cc1_desc            TEXT,
    cc1_price           TEXT,
    cc2_desc            TEXT,
    cc2_price           TEXT,
    cc3_desc            TEXT,
    cc3_price           TEXT,
    cc4_desc            TEXT,
    cc4_price           TEXT,
    cc5_desc            TEXT,
    cc5_price           TEXT,
    datasheet           TEXT,
    sizing_sheet        TEXT,
    gad                 TEXT,
    cell_certificate    TEXT,
    battery_compliance  TEXT,
    warranty            TEXT,
    remarks             TEXT,
    handled_by          TEXT,
    submission_date     TEXT,
    submitted_to        TEXT,
    submitted_by        TEXT,
    created_at          BIGINT,
    quote_code          TEXT,
    sol_no              TEXT,
    dollar_rate         TEXT,
    base_partcode       TEXT,
    quote_format        TEXT,
    UNIQUE(username, sr_no)
);
CREATE INDEX IF NOT EXISTS idx_inquiry_code ON inquiry(inquiry_code);

CREATE TABLE IF NOT EXISTS active_quotes (
    id                SERIAL PRIMARY KEY,
    username          TEXT NOT NULL DEFAULT '',
    scope             TEXT NOT NULL DEFAULT 'normal',
    code              TEXT NOT NULL,
    date              TEXT,
    customer_name     TEXT,
    solution_provider TEXT,
    format            TEXT,
    sales_person      TEXT DEFAULT '',
    dollar_rate       TEXT DEFAULT '',
    warranty_years    TEXT DEFAULT '5',
    UNIQUE(username, scope, code)
);

CREATE TABLE IF NOT EXISTS quote_items (
    id                SERIAL PRIMARY KEY,
    username          TEXT NOT NULL DEFAULT '',
    scope             TEXT NOT NULL DEFAULT 'normal',
    quote_code        TEXT NOT NULL DEFAULT '',
    code              TEXT,
    format            TEXT,
    date              TEXT,
    solution_provider TEXT,
    customer_name     TEXT,
    sr_no             INTEGER,
    sol_no            TEXT,
    ups_rating        TEXT,
    backup_requirement TEXT,
    calc_load         TEXT,
    calc_load_unit    TEXT,
    celltype          TEXT,
    centre_tapping    TEXT,
    batterypartcode   TEXT,
    backup_time       TEXT,
    quantity          INTEGER,
    quote_price       REAL,
    modular_rack      TEXT,
    system_text       TEXT,
    solution_text     TEXT,
    item_type         TEXT DEFAULT 'system',
    ageing_type       TEXT DEFAULT 'BOL',
    original_price    REAL
);
CREATE INDEX IF NOT EXISTS idx_quote_items ON quote_items(username, scope, quote_code);

CREATE TABLE IF NOT EXISTS costing_tree (
    id       SERIAL PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_costing_tree_user ON costing_tree(username);

CREATE TABLE IF NOT EXISTS firebase_store (
    root       TEXT NOT NULL,
    key        TEXT NOT NULL,
    data       JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (root, key)
);
CREATE INDEX IF NOT EXISTS idx_firebase_store_root ON firebase_store(root);

CREATE TABLE IF NOT EXISTS mass_sizing (
    sr_no                       SERIAL PRIMARY KEY,
    position                    REAL,
    created_at                  REAL,
    created_by                  TEXT,
    partcode                    TEXT,
    ups_make                    TEXT,
    ups_model                   TEXT,
    ups_rating_kva              TEXT,
    actual_load_kva             TEXT,
    actual_load_kw              TEXT,
    power_factor                TEXT,
    inverter_efficiency         TEXT,
    nominal_dc_voltage          TEXT,
    backup_requirement_min      TEXT,
    cell_chemistry              TEXT,
    ageing_type                 TEXT,
    ageing_pct                  TEXT,
    design_margin_pct           TEXT,
    dod_margin_pct              TEXT,
    derating_pct                TEXT,
    nearest_capacity_ah         TEXT,
    calculated_load_kw          TEXT,
    number_of_cells             TEXT,
    max_charging_voltage        TEXT,
    end_cell_voltage            TEXT,
    energy_required_kwh         TEXT,
    capacity_required_ah        TEXT,
    cap_with_ageing_ah          TEXT,
    cap_with_design_margin_ah   TEXT,
    cap_with_dod_ah             TEXT,
    cap_with_derating_ah        TEXT,
    backup_time_min             TEXT,
    total_available_energy_kwh  TEXT,
    offered_battery_config      TEXT
);

CREATE TABLE IF NOT EXISTS po_tracking (
    id                       SERIAL PRIMARY KEY,
    sr_no                    INTEGER,
    inquiry_code             TEXT DEFAULT '',
    customer_name            TEXT DEFAULT '',
    project_name             TEXT DEFAULT '',
    po_no                    TEXT DEFAULT '',
    po_date                  TEXT DEFAULT '',
    solution                 TEXT DEFAULT '',
    inquiry_qty              TEXT DEFAULT '',
    po_qty                   TEXT DEFAULT '',
    unit_price               TEXT DEFAULT '',
    total_price              TEXT DEFAULT '',
    total_qty                TEXT DEFAULT '',
    balance_qty              TEXT DEFAULT '',
    total_dispatch_qty       TEXT DEFAULT '',
    total_pending_qty        TEXT DEFAULT '',
    cell_used                TEXT DEFAULT '',
    cells_per_rack           TEXT DEFAULT '',
    total_cells_required     TEXT DEFAULT '',
    remarks                  TEXT DEFAULT '',
    po_uploaded_by           TEXT DEFAULT '',
    completion_date          TEXT DEFAULT '',
    expected_completion_date TEXT DEFAULT '',
    days_to_complete         TEXT DEFAULT '',
    document_filename        TEXT DEFAULT '',
    rounded_off_price        TEXT DEFAULT '',
    price_lost_roundoff      TEXT DEFAULT '',
    terms_and_conditions     TEXT DEFAULT '',
    created_at               BIGINT
);

CREATE TABLE IF NOT EXISTS po_dispatches (
    id            SERIAL PRIMARY KEY,
    po_id         INTEGER NOT NULL,
    dispatch_date TEXT DEFAULT '',
    dispatch_code TEXT DEFAULT '',
    dispatch_qty  REAL DEFAULT 0,
    created_at    BIGINT
);

CREATE TABLE IF NOT EXISTS cell_voltages (
    chemistry TEXT PRIMARY KEY,
    nominal   REAL NOT NULL,
    max_v     REAL NOT NULL,
    end_v     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS dc_to_cells (
    dc_voltage INTEGER PRIMARY KEY,
    num_cells  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sizing_formulas (
    name        TEXT PRIMARY KEY,
    expression  TEXT NOT NULL,
    description TEXT,
    sort_order  INTEGER
);

CREATE TABLE IF NOT EXISTS quote_rates (
    key         TEXT PRIMARY KEY,
    value       REAL NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS costing_presets (
    key         TEXT PRIMARY KEY,
    value       REAL NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS modular_rack_rates (
    key   TEXT PRIMARY KEY,
    price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sizings (
    id                          SERIAL PRIMARY KEY,
    username                    TEXT NOT NULL DEFAULT '',
    project_name                TEXT NOT NULL DEFAULT '',
    sr_no                       INTEGER NOT NULL,
    customer_name               TEXT,
    solution_provider           TEXT,
    ups_make                    TEXT,
    ups_model                   TEXT,
    ups_rating_kva              REAL,
    actual_load_kva             REAL,
    actual_load_kw              REAL,
    power_factor                REAL,
    inverter_efficiency         REAL,
    nominal_dc_voltage          REAL,
    backup_requirement_min      REAL,
    ageing_fraction             REAL,
    design_margin_percent       REAL,
    dod_margin_percent          REAL,
    derating_factor_percent     REAL,
    number_of_cells             INTEGER,
    cell_chemistry              TEXT,
    calculated_load_kw          REAL,
    max_charging_voltage        REAL,
    end_cell_voltage            REAL,
    energy_required_kwh         REAL,
    capacity_required_ah        REAL,
    cap_with_ageing_ah          REAL,
    cap_with_design_margin_ah   REAL,
    cap_with_dod_margin_ah      REAL,
    cap_with_derating_factor_ah REAL,
    nearest_capacity_ah         REAL,
    offered_battery_config      TEXT,
    total_available_energy_kwh  REAL,
    backup_time_min             REAL,
    ageing_type                 TEXT DEFAULT 'BOL',
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, project_name, sr_no)
);
CREATE INDEX IF NOT EXISTS idx_sizings ON sizings(username, project_name);

CREATE TABLE IF NOT EXISTS sizing_projects (
    id           SERIAL PRIMARY KEY,
    username     TEXT NOT NULL,
    project_name TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, project_name)
);
"""

_SEED = """
INSERT INTO cell_voltages VALUES ('LFP', 3.2, 3.6, 2.8) ON CONFLICT DO NOTHING;
INSERT INTO cell_voltages VALUES ('NPM', 3.6, 4.2, 3.0) ON CONFLICT DO NOTHING;

INSERT INTO dc_to_cells VALUES (12, 4)   ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (24, 8)   ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (36, 11)  ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (48, 15)  ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (72, 23)  ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (96, 30)  ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (120, 38) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (144, 45) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (192, 60) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (240, 75) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (336, 105) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (360, 112) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (384, 120) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (408, 128) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (480, 150) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (512, 160) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (528, 165) ON CONFLICT DO NOTHING;
INSERT INTO dc_to_cells VALUES (576, 180) ON CONFLICT DO NOTHING;

INSERT INTO sizing_formulas VALUES ('load',
  'actual_kw / inverter_eff if actual_kw > 0 else (actual_kva * power_factor / inverter_eff if actual_kva > 0 else ups_kva * power_factor / inverter_eff)',
  'Calculated Load (kW)', 1) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('max_charging_voltage', 'num_cells * cell_max', 'Max Charging Voltage (V)', 2) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('end_cell_voltage', 'num_cells * cell_end', 'End Cell Voltage (V)', 3) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('energy_required', '(load * backup_minutes) / 60', 'Energy Required (kWh)', 4) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('capacity_required', '(energy_required * 1000) / end_cell_voltage if end_cell_voltage > 0 else 0', 'Capacity Required (Ah)', 5) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('cap_with_ageing', 'capacity_required * (1 + ageing_percent / 100)', 'Cap req w/ Ageing (Ah)', 6) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('cap_with_design_margin', 'cap_with_ageing * (1 + design_margin_percent / 100)', 'Cap req w/ Design Margin (Ah)', 7) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('cap_with_dod', 'cap_with_design_margin / (dod_margin_percent / 100) if dod_margin_percent > 0 else cap_with_design_margin', 'Cap req w/ DOD Margin (Ah)', 8) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('cap_with_derating', 'cap_with_dod * (1 + derating_factor_percent / 100)', 'Cap req w/ Derating (Ah)', 9) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('backup_time', 'floor((backup_minutes / cap_with_derating) * nearest_capacity) if cap_with_derating > 0 else 0', 'Backup Time (Min)', 10) ON CONFLICT DO NOTHING;
INSERT INTO sizing_formulas VALUES ('total_energy', '(nominal_dc_voltage * nearest_capacity) / 1000', 'Total Available Energy (kWh)', 11) ON CONFLICT DO NOTHING;

INSERT INTO quote_rates VALUES ('fire_suppression', 6100.0, 'Fire Suppression System (per module)') ON CONFLICT DO NOTHING;
INSERT INTO quote_rates VALUES ('rmd_hvl', 6400.0, 'Remote Monitoring Device HVL (per module)') ON CONFLICT DO NOTHING;
INSERT INTO quote_rates VALUES ('rmd_efl', 4850.0, 'Remote Monitoring Device EFL (per module)') ON CONFLICT DO NOTHING;
INSERT INTO quote_rates VALUES ('subscription', 1500.0, 'Subscription Charges (per year)') ON CONFLICT DO NOTHING;

INSERT INTO costing_presets VALUES ('cell_clearing_customs_pct', 7.5, 'Cell Clearing & Customs %') ON CONFLICT DO NOTHING;
INSERT INTO costing_presets VALUES ('bms_clearing_customs_pct', 18.0, 'BMS/PCM Clearing & Customs %') ON CONFLICT DO NOTHING;

INSERT INTO modular_rack_rates VALUES ('W=600*D=1000*H=880',  30000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=1000*H=1392', 40000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=1000*H=1882', 49000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=1000*H=1971', 64000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=1000*H=2058', 69000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=800*H=992',   30000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=800*H=1704',  43000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=1000*H=2325', 70000.0) ON CONFLICT DO NOTHING;
INSERT INTO modular_rack_rates VALUES ('W=600*D=1400*H=1882', 70000.0) ON CONFLICT DO NOTHING;
"""


_MIGRATE = """
ALTER TABLE active_quotes ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE quote_items  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE pending_items   ADD COLUMN IF NOT EXISTS cell_certificate_name TEXT DEFAULT '';
ALTER TABLE export_history  ADD COLUMN IF NOT EXISTS cell_certificate_name TEXT DEFAULT '';
ALTER TABLE inquiry         ADD COLUMN IF NOT EXISTS cell_certificate TEXT;
ALTER TABLE pending_items   ADD COLUMN IF NOT EXISTS battery_compliance_name TEXT DEFAULT '';
ALTER TABLE export_history  ADD COLUMN IF NOT EXISTS battery_compliance_name TEXT DEFAULT '';
ALTER TABLE quote_items     ADD COLUMN IF NOT EXISTS original_price REAL;
DELETE FROM quote_rates WHERE key IN ('cell_clearing_customs_pct', 'bms_clearing_customs_pct');
"""


def init_all_tables():
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(_SCHEMA)
        cur.execute(_MIGRATE)
        cur.execute(_SEED)
