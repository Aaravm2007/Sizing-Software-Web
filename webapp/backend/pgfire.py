"""
PostgreSQL-backed replacement for Firebase RTDB access.

Data lives in firebase_store(root, key, data JSONB). Keys may contain '/'
for nested paths (products/{duration}/{id} -> root='products',
key='{duration}/{id}'). Firebase path semantics are preserved: get() on a
prefix returns the assembled subtree, delete() removes the subtree,
update() shallow-merges (creating the row if missing), get() on a missing
path returns None.
"""
import psycopg2.extras

from pg import get_conn


def _nest(rows):
    """Assemble (key, data) rows — keys may contain '/' — into a nested dict."""
    out = {}
    for key, data in rows:
        parts = key.split("/")
        node = out
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = data
    return out


def get(root, key=None):
    with get_conn() as conn:
        cur = conn.cursor()
        if key is None:
            cur.execute("SELECT key, data FROM firebase_store WHERE root = %s", (root,))
            rows = cur.fetchall()
            return _nest(rows) if rows else None
        cur.execute("SELECT data FROM firebase_store WHERE root = %s AND key = %s", (root, key))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            "SELECT key, data FROM firebase_store WHERE root = %s AND key LIKE %s",
            (root, key + "/%"),
        )
        rows = [(k[len(key) + 1:], d) for k, d in cur.fetchall()]
        return _nest(rows) if rows else None


def set(root, key, value):
    with get_conn() as conn:
        conn.cursor().execute(
            """INSERT INTO firebase_store (root, key, data) VALUES (%s, %s, %s)
               ON CONFLICT (root, key)
               DO UPDATE SET data = excluded.data, updated_at = now()""",
            (root, key, psycopg2.extras.Json(value)),
        )


def update(root, key, patch):
    with get_conn() as conn:
        conn.cursor().execute(
            """INSERT INTO firebase_store (root, key, data) VALUES (%s, %s, %s)
               ON CONFLICT (root, key)
               DO UPDATE SET data = firebase_store.data || excluded.data, updated_at = now()""",
            (root, key, psycopg2.extras.Json(patch)),
        )


def delete(root, key):
    with get_conn() as conn:
        conn.cursor().execute(
            "DELETE FROM firebase_store WHERE root = %s AND (key = %s OR key LIKE %s)",
            (root, key, key + "/%"),
        )


def list_keys(root, prefix=None):
    with get_conn() as conn:
        cur = conn.cursor()
        if prefix:
            cur.execute(
                "SELECT key FROM firebase_store WHERE root = %s AND key LIKE %s ORDER BY key",
                (root, prefix + "/%"),
            )
        else:
            cur.execute("SELECT key FROM firebase_store WHERE root = %s ORDER BY key", (root,))
        return [r[0] for r in cur.fetchall()]
