"""One-process local run history; parameterized SQL and a lock serialize writes."""
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
import json
import duckdb

ROOT = Path(__file__).resolve().parents[1]
LOCK = Lock()


@contextmanager
def connection(path=None):
    target = Path(path) if path else ROOT / "runtime/runs.duckdb"
    target.parent.mkdir(parents=True, exist_ok=True)
    with LOCK:
        with duckdb.connect(str(target)) as db:
            db.execute("CREATE TABLE IF NOT EXISTS runs (id VARCHAR PRIMARY KEY, created_at VARCHAR, name VARCHAR, payload VARCHAR)")
            yield db


def save(run, path=None):
    with connection(path) as db:
        db.execute("INSERT INTO runs VALUES (?, ?, ?, ?)", [run["id"], run["created_at"], run["parameters"]["name"], json.dumps(run, allow_nan=False)])


def get(run_id, path=None):
    with connection(path) as db:
        row = db.execute("SELECT payload FROM runs WHERE id = ?", [run_id]).fetchone()
    return json.loads(row[0]) if row else None


def history(path=None):
    with connection(path) as db:
        rows = db.execute("SELECT id, created_at, name, payload FROM runs ORDER BY created_at DESC LIMIT 100").fetchall()
    return [{"id": row[0], "created_at": row[1], "name": row[2], "status": json.loads(row[3])["optimized"]["status"]} for row in rows]
