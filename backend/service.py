"""Reproducible run snapshots and a plain-English decision brief; no LLM."""
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import gzip
import hashlib
import json
import platform
from importlib.metadata import version
from .planner import greedy, optimize, planning_inputs
from .contracts import Parameters

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = "a236999d5fd3429de9a2726aa69bdf73ca83256cf9ed5284db9fe35756e0715a"
ENGINE_TEXT = "\n".join((ROOT / "backend" / name).read_text(encoding="utf-8") for name in ["contracts.py", "planner.py", "audit.py", "service.py"])
ENGINE_SHA = hashlib.sha256(ENGINE_TEXT.encode()).hexdigest()


def load_scenario():
    source = ROOT / "data/retail_first_50000.csv.gz"
    if hashlib.sha256(gzip.decompress(source.read_bytes())).hexdigest() != SOURCE_SHA:
        raise ValueError("Public source changed. Restore or review the data bundle.")
    scenario = json.loads((ROOT / "data/scenario.json").read_text(encoding="utf-8"))
    if scenario["source_sha256"] != SOURCE_SHA or len(scenario["products"]) != 6 or len(scenario["inventory"]) != 18:
        raise ValueError("Unexpected scenario shape or provenance.")
    sql = (ROOT / "data/demand.sql").read_text(encoding="utf-8")
    if sql != scenario["demand_sql"] or hashlib.sha256(sql.encode()).hexdigest() != scenario["demand_sql_sha256"]:
        raise ValueError("Demand SQL changed. Review it and regenerate the fixture before startup.")
    return scenario


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def make_run(scenario, parameters):
    baseline, optimized = greedy(scenario, parameters), optimize(scenario, parameters)
    comparable = bool(optimized["audit"] and optimized["audit"]["valid"] and baseline["audit"]["valid"])
    reduction = None
    if comparable and baseline["metrics"]["objective_pence"]:
        reduction = 100 * (baseline["metrics"]["objective_pence"] - optimized["metrics"]["objective_pence"]) / baseline["metrics"]["objective_pence"]
    sql = scenario["demand_sql"]
    budgets = sorted({0, parameters.budget_gbp // 2, parameters.budget_gbp,
                      min(30000, parameters.budget_gbp + max(500, parameters.budget_gbp // 2))})
    sensitivity = []
    for budget in budgets:
        candidate = optimized if budget == parameters.budget_gbp else optimize(
            scenario, Parameters(**{**parameters.model_dump(), "budget_gbp": budget}))
        sensitivity.append({"budget_gbp": budget, "status": candidate["status"], "metrics": candidate["metrics"]})
    cells, offers = planning_inputs(scenario, parameters)
    supply_bounds = []
    for product in scenario["products"]:
        sku = product["sku"]
        required = sum(c["demand"] for c in cells if c["sku"] == sku)
        initial = sum(c["initial_stock"] for c in cells if c["sku"] == sku)
        capacity = sum(o["available_capacity"] for o in offers if o["sku"] == sku)
        supply_bounds.append({"sku": sku, "required": required, "initial_stock": initial,
                              "eligible_supplier_capacity": capacity,
                              "minimum_unmet_from_supply": max(required - initial - capacity, 0)})
    return {"id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(timespec="microseconds"),
            "parameters": parameters.model_dump(), "scenario_snapshot": scenario, "scenario_sha256": digest(scenario),
            "input_sha256": digest({"scenario": scenario, "parameters": parameters.model_dump()}),
            "engine_version": "1.0.0", "engine_sha256": ENGINE_SHA,
            "source_sql": sql, "source_sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
            "runtime": {"python": platform.python_version(), **{p: version(p) for p in ["numpy", "scipy", "duckdb", "fastapi"]}},
            "baseline": baseline, "optimized": optimized, "comparable": comparable,
            "budget_sensitivity": sensitivity,
            "supply_bounds": supply_bounds,
            "objective_reduction_pct": reduction,
            "interpretation": "Model objective = action spending + assumed shortfall penalties. It is not measured company savings. The solver optimizes this objective, not service alone."}


def brief(run):
    p = run["parameters"]
    lines = ["# Supply Chain Disruption Decision Brief", "", f"Scenario: {p['name']}", f"Run: {run['id']}",
             f"Created UTC: {run['created_at']}", "", "## Scope", "Seven-day, end-of-horizon allocation simulation. Historical sale counts inform assumed requirements; all stock, supplier and cost inputs are fictional (seed 42). This is not a forecast or real savings claim.", "", "## Parameters", "```json", json.dumps(p, indent=2), "```", "", "## Comparison", "| Measure | Greedy baseline | Optimizer |", "|---|---:|---:|"]
    b, o = run["baseline"], run["optimized"]
    for label, key, money in [("Served units", "served", False), ("Unmet units", "shortfall", False), ("Action spending GBP", "action_cost_pence", True), ("Assumed penalty GBP", "shortfall_penalty_pence", True), ("Model objective GBP", "objective_pence", True)]:
        def fmt(plan):
            if plan["metrics"] is None:
                return "unavailable"
            value = plan["metrics"][key]
            return f"{value / 100:,.2f}" if money else f"{value:,}"
        lines.append(f"| {label} | {fmt(b)} | {fmt(o)} |")
    lines.extend(["", f"Solver status: {o['status']}. Baseline constraint-valid: {b['audit']['valid']}.", run["interpretation"], "", "## Recommended actions for review", "| Type | SKU | Origin / supplier | Destination | Units |", "|---|---|---|---|---:|"])
    for row in o["decisions"]:
        lines.append(f"| {row['kind']} | {row['sku']} | {row.get('supplier', row.get('from_hub'))} | {row['hub']} | {row['units']} |")
    if not o["decisions"]:
        lines.append("| No optimizer action plan available | | | | |")
    lines.extend(["", "## Physical supply bounds", "| SKU | Required | Initial stock | Eligible supply capacity | Unavoidable unmet units (lower bound) |", "|---|---:|---:|---:|---:|"])
    for row in run["supply_bounds"]:
        lines.append(f"| {row['sku']} | {row['required']} | {row['initial_stock']} | {row['eligible_supplier_capacity']} | {row['minimum_unmet_from_supply']} |")
    lines.append("These bounds ignore budget, receiving and transfer restrictions. A zero lower bound does not establish feasibility.")
    lines.extend(["", "## Evidence", f"Input SHA-256: {run['input_sha256']}", f"Scenario SHA-256: {run['scenario_sha256']}", f"Engine SHA-256: {run['engine_sha256']}", f"Public source SHA-256: {run['scenario_snapshot']['source_sha256']}", "", "Source: Chen, D. (2015). Online Retail. UCI Machine Learning Repository. https://doi.org/10.24432/C5BW33. CC BY 4.0.", "", "## Limits", "No daily stockout timing, original-purchase matching, verified supplier data, uncertainty distribution, optimal real-world policy or automated order placement. Transfers use initial surplus only; new receipts cannot be forwarded. At-limit constraints alone do not prove causal bottlenecks."])
    return "\n".join(lines) + "\n"
