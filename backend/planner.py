"""A small, explicit end-of-horizon allocation model and a greedy comparator."""
from collections import defaultdict
import math
import time
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from .audit import audit_plan


def planning_inputs(scenario, parameters):
    cells = []
    for row in scenario["inventory"]:
        cell = dict(row)
        # Ceil per cell is intentional and visible; demand is a scenario assumption.
        cell["demand"] = math.ceil(row["base_demand"] * parameters.demand_pct / 100)
        cells.append(cell)
    offers = []
    for row in scenario["offers"]:
        offer = dict(row)
        offer["arrival_days"] = row["lead_days"] + parameters.extra_lead_days
        unavailable = parameters.disrupted_supplier in (row["supplier"], "All")
        late = offer["arrival_days"] > scenario["horizon_days"]
        offer["available_capacity"] = 0 if unavailable or late else row["capacity"] * parameters.supplier_capacity_pct // 100
        offers.append(offer)
    return cells, offers


def assemble(scenario, parameters, cells, offers, decisions, method, status, seconds, gap=None):
    """Turn decisions into a common report, then independently check conservation."""
    allocations = []
    for cell in cells:
        sku, hub = cell["sku"], cell["hub"]
        purchases = sum(r["units"] for r in decisions if r["kind"] == "purchase" and r["sku"] == sku and r["hub"] == hub)
        incoming = sum(r["units"] for r in decisions if r["kind"] == "transfer" and r["sku"] == sku and r["hub"] == hub)
        outgoing = sum(r["units"] for r in decisions if r["kind"] == "transfer" and r["sku"] == sku and r["from_hub"] == hub)
        available = cell["initial_stock"] + purchases + incoming - outgoing
        served = min(cell["demand"], available)
        allocations.append({**cell, "purchased": purchases, "transfer_in": incoming, "transfer_out": outgoing,
                            "served": served, "shortfall": cell["demand"] - served, "ending_stock": available - served})
    penalties = {p["sku"]: p["shortfall_penalty_pence"] for p in scenario["products"]}
    purchase = sum(r["units"] * r["unit_cost_pence"] for r in decisions if r["kind"] == "purchase")
    transfer = sum(r["units"] * r["unit_cost_pence"] for r in decisions if r["kind"] == "transfer")
    penalty = sum(r["shortfall"] * penalties[r["sku"]] for r in allocations)
    demand = sum(r["demand"] for r in cells)
    served = sum(r["served"] for r in allocations)
    result = {"method": method, "status": status, "seconds": round(seconds, 6), "mip_gap": gap,
              "allocations": allocations, "decisions": decisions,
              "metrics": {"demand": demand, "served": served, "shortfall": demand - served,
                          "service_pct": 100 * served / demand if demand else None,
                          "purchase_cost_pence": purchase, "transfer_cost_pence": transfer,
                          "action_cost_pence": purchase + transfer, "shortfall_penalty_pence": penalty,
                          "objective_pence": purchase + transfer + penalty,
                          "transferred_units": sum(r["units"] for r in decisions if r["kind"] == "transfer")}}
    result["audit"] = audit_plan(scenario, parameters, cells, offers, result)
    return result


def greedy(scenario, parameters):
    """Use initial stock, then transfer surplus, then buy by SKU and cheapest offer."""
    started = time.perf_counter()
    cells, offers = planning_inputs(scenario, parameters)
    remaining = {(r["sku"], r["hub"]): max(r["demand"] - r["initial_stock"], 0) for r in cells}
    surplus = {(r["sku"], r["hub"]): max(r["initial_stock"] - r["demand"], 0) for r in cells}
    receipts = defaultdict(int)
    budget = parameters.budget_gbp * 100
    decisions = []
    transfer_left = parameters.transfer_limit if parameters.allow_transfers and scenario["transfer_lead_days"] <= scenario["horizon_days"] else 0
    cost = scenario["transfer_unit_cost_pence"]
    for sku, hub in remaining:
        for origin in scenario["hubs"]:
            if origin == hub:
                continue
            qty = min(remaining[sku, hub], surplus[sku, origin], transfer_left, budget // cost,
                      scenario["receiving_capacity"][hub] - receipts[hub])
            if qty > 0:
                decisions.append({"kind": "transfer", "sku": sku, "hub": hub, "from_hub": origin,
                                  "units": qty, "unit_cost_pence": cost, "arrival_days": scenario["transfer_lead_days"]})
                remaining[sku, hub] -= qty
                surplus[sku, origin] -= qty
                transfer_left -= qty
                receipts[hub] += qty
                budget -= qty * cost
    capacity = {(o["supplier"], o["sku"]): o["available_capacity"] for o in offers}
    for sku, hub in remaining:
        for offer in sorted((o for o in offers if o["sku"] == sku), key=lambda o: (o["unit_cost_pence"], o["supplier"])):
            cost = offer["unit_cost_pence"]
            key = offer["supplier"], sku
            qty = min(remaining[sku, hub], capacity[key], budget // cost, scenario["receiving_capacity"][hub] - receipts[hub])
            if qty > 0:
                decisions.append({"kind": "purchase", "sku": sku, "hub": hub, "supplier": offer["supplier"],
                                  "units": qty, "unit_cost_pence": cost, "arrival_days": offer["arrival_days"]})
                remaining[sku, hub] -= qty
                capacity[key] -= qty
                receipts[hub] += qty
                budget -= qty * cost
    return assemble(scenario, parameters, cells, offers, decisions, "Greedy baseline", "heuristic", time.perf_counter() - started)


def optimize(scenario, parameters):
    """Minimize action costs + assumed shortfall penalties, in integer pennies."""
    started = time.perf_counter()
    cells, offers = planning_inputs(scenario, parameters)
    products = {p["sku"]: p for p in scenario["products"]}
    variables = []
    costs, upper = [], []

    def add(kind, sku, hub, bound, cost=0, **extra):
        variables.append({"kind": kind, "sku": sku, "hub": hub, **extra})
        costs.append(cost)
        upper.append(bound)
        return len(variables) - 1

    served, unmet, ending = {}, {}, {}
    for cell in cells:
        key = cell["sku"], cell["hub"]
        served[key] = add("served", *key, cell["demand"])
        unmet[key] = add("unmet", *key, cell["demand"], products[cell["sku"]]["shortfall_penalty_pence"])
        ending[key] = add("ending", *key, np.inf)
    for offer in offers:
        for hub in scenario["hubs"]:
            add("purchase", offer["sku"], hub, offer["available_capacity"], offer["unit_cost_pence"],
                supplier=offer["supplier"], arrival_days=offer["arrival_days"], unit_cost_pence=offer["unit_cost_pence"])
    for cell in cells:
        limit = max(cell["initial_stock"] - cell["demand"], 0)
        if not parameters.allow_transfers or scenario["transfer_lead_days"] > scenario["horizon_days"]:
            limit = 0
        for hub in scenario["hubs"]:
            if hub != cell["hub"]:
                add("transfer", cell["sku"], hub, limit, scenario["transfer_unit_cost_pence"], from_hub=cell["hub"],
                    arrival_days=scenario["transfer_lead_days"], unit_cost_pence=scenario["transfer_unit_cost_pence"])
    matrix, lower, higher = [], [], []

    def constraint(terms, low=-np.inf, high=np.inf):
        row = np.zeros(len(variables))
        for index, coefficient in terms:
            row[index] += coefficient
        matrix.append(row)
        lower.append(low)
        higher.append(high)

    for cell in cells:
        key = cell["sku"], cell["hub"]
        constraint([(served[key], 1), (unmet[key], 1)], cell["demand"], cell["demand"])
        balance = [(served[key], 1), (ending[key], 1)]
        for i, variable in enumerate(variables):
            if variable["sku"] != cell["sku"]:
                continue
            if variable["kind"] in ("purchase", "transfer") and variable["hub"] == cell["hub"]:
                balance.append((i, -1))
            if variable["kind"] == "transfer" and variable["from_hub"] == cell["hub"]:
                balance.append((i, 1))
        constraint(balance, cell["initial_stock"], cell["initial_stock"])
        outgoing = [(i, 1) for i, v in enumerate(variables) if v["kind"] == "transfer" and v["sku"] == cell["sku"] and v["from_hub"] == cell["hub"]]
        constraint(outgoing, high=max(cell["initial_stock"] - cell["demand"], 0))
    for offer in offers:
        constraint([(i, 1) for i, v in enumerate(variables) if v["kind"] == "purchase" and v["supplier"] == offer["supplier"] and v["sku"] == offer["sku"]], high=offer["available_capacity"])
    for hub in scenario["hubs"]:
        constraint([(i, 1) for i, v in enumerate(variables) if v["kind"] in ("purchase", "transfer") and v["hub"] == hub], high=scenario["receiving_capacity"][hub])
    constraint([(i, costs[i]) for i, v in enumerate(variables) if v["kind"] in ("purchase", "transfer")], high=parameters.budget_gbp * 100)
    constraint([(i, 1) for i, v in enumerate(variables) if v["kind"] == "transfer"], high=parameters.transfer_limit if parameters.allow_transfers else 0)
    required = math.ceil(sum(c["demand"] for c in cells) * parameters.minimum_service_pct / 100)
    constraint([(i, 1) for i in served.values()], low=required)
    solution = milp(np.array(costs, dtype=float), integrality=np.ones(len(variables)),
                    bounds=Bounds(np.zeros(len(variables)), np.array(upper)),
                    constraints=LinearConstraint(np.array(matrix), np.array(lower), np.array(higher)),
                    options={"time_limit": 5, "mip_rel_gap": 0.0})
    seconds = time.perf_counter() - started
    if solution.x is None:
        return {"method": "Constrained optimizer", "status": "infeasible" if solution.status == 2 else "not_solved",
                "seconds": round(seconds, 6), "message": str(solution.message), "metrics": None,
                "decisions": [], "allocations": [], "audit": None, "mip_gap": None}
    # Reject nonintegral results rather than silently publishing rounded violations.
    rounded = np.rint(solution.x)
    if np.max(np.abs(solution.x - rounded)) > 1e-5:
        raise RuntimeError("Solver returned a nonintegral plan.")
    decisions = [{**v, "units": int(qty)} for v, qty in zip(variables, rounded) if v["kind"] in ("purchase", "transfer") and qty > 0]
    gap = float(solution.mip_gap) if getattr(solution, "mip_gap", None) is not None and math.isfinite(solution.mip_gap) else None
    status = "optimal" if solution.status == 0 else "feasible_not_proven_optimal"
    report = assemble(scenario, parameters, cells, offers, decisions, "Constrained optimizer", status, seconds, gap)
    if not report["audit"]["valid"]:
        raise RuntimeError("Independent physical audit rejected the solver plan.")
    if abs(report["metrics"]["objective_pence"] - float(solution.fun)) > .1:
        raise RuntimeError("Reconstructed objective does not match solver objective.")
    return report
