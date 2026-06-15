import sqlite3
from contextlib import contextmanager
from config import settings


@contextmanager
def get_sizing_db():
    conn = sqlite3.connect(settings.SIZING_DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_costing_db():
    conn = sqlite3.connect(settings.COSTING_DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_temp_db():
    conn = sqlite3.connect(settings.TEMP_DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
