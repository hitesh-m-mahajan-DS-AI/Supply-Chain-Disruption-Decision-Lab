"""Single-origin local API and built React interface. No external services."""
from pathlib import Path
from uuid import UUID
from threading import Lock
import csv
import io
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from .contracts import Parameters, PRESETS
from .service import load_scenario, make_run, brief
from . import store

ROOT = Path(__file__).resolve().parents[1]
SCENARIO = load_scenario()
app = FastAPI(title="Supply Chain Disruption Decision Lab", version="1.0.0")
RUN_LOCK = Lock()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0", "mode": "local simulation"}


@app.get("/api/catalog")
def catalog():
    return {"scenario": SCENARIO, "presets": PRESETS, "sql": SCENARIO["demand_sql"],
            "source": {"title": "UCI Online Retail", "url": "https://archive.ics.uci.edu/dataset/352/online+retail",
                       "license": "CC BY 4.0", "raw_rows": 50000, "selected_products": 6}}


@app.post("/api/runs", status_code=201)
def create_run(parameters: Parameters):
    if not parameters.name.strip():
        raise HTTPException(422, "Give the scenario a nonblank name.")
    try:
        # A single-user local app serializes solver calls and database writes.
        with RUN_LOCK:
            run = make_run(SCENARIO, parameters)
            store.save(run)
    except RuntimeError as error:
        raise HTTPException(503, "The calculation failed its integrity checks. No run was saved.") from error
    return run


@app.get("/api/runs")
def runs():
    return store.history()


def find_run(run_id: UUID):
    run = store.get(str(run_id))
    if run is None:
        raise HTTPException(404, "Run not found.")
    return run


@app.get("/api/runs/{run_id}")
def run_detail(run_id: UUID):
    return find_run(run_id)


@app.get("/api/runs/{run_id}/export/{kind}")
def export(run_id: UUID, kind: str):
    run = find_run(run_id)
    headers = {"Content-Disposition": f'attachment; filename="decision-{run_id}.{kind}"'}
    if kind == "json":
        return JSONResponse(run, headers=headers)
    if kind == "md":
        return Response(brief(run), media_type="text/markdown", headers=headers)
    if kind == "csv":
        data = io.StringIO(newline="")
        fields = ["method", "kind", "sku", "supplier", "from_hub", "hub", "units", "unit_cost_pence", "arrival_days"]
        writer = csv.DictWriter(data, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for method in ["baseline", "optimized"]:
            for row in run[method]["decisions"]:
                writer.writerow({**row, "method": method})
        return Response(data.getvalue(), media_type="text/csv", headers=headers)
    raise HTTPException(404, "Choose json, md or csv export.")


dist = ROOT / "frontend/dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
else:
    @app.get("/")
    def missing_build():
        return {"message": "Run python setup_project.py, then python launch.py to open the interface."}
