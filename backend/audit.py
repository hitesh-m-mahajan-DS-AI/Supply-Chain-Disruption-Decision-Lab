"""Reconstruct physical and financial constraints independently of the MILP matrix."""
from collections import defaultdict
import math


def audit_plan(scenario, parameters, cells, offers, plan):
    violations, checks = [], []
    received, supply, outbound = defaultdict(int), defaultdict(int), defaultdict(int)
    buy_by_cell, incoming, outgoing = defaultdict(int), defaultdict(int), defaultdict(int)
    offer_lookup = {(o["supplier"], o["sku"]): o for o in offers}
    costs = 0
    for row in plan["decisions"]:
        qty = row["units"]
        if not isinstance(qty, int) or qty <= 0:
            violations.append("Decision quantities must be positive integers.")
        key = row["sku"], row["hub"]
        received[row["hub"]] += qty
        if row["kind"] == "purchase":
            offer = offer_lookup.get((row["supplier"], row["sku"]))
            if offer is None or offer["available_capacity"] <= 0 or offer["arrival_days"] > scenario["horizon_days"]:
                violations.append("Unavailable/late purchase route used.")
                continue
            if row["unit_cost_pence"] != offer["unit_cost_pence"]:
                violations.append("Purchase price differs from source assumption.")
            if row["arrival_days"] != offer["arrival_days"]:
                violations.append("Purchase arrival differs from source assumption.")
            costs += qty * offer["unit_cost_pence"]
            supply[row["supplier"], row["sku"]] += qty
            buy_by_cell[key] += qty
        elif row["kind"] == "transfer":
            if row["hub"] == row["from_hub"] or row["from_hub"] not in scenario["hubs"] or not parameters.allow_transfers or scenario["transfer_lead_days"] > scenario["horizon_days"]:
                violations.append("Invalid transfer route used.")
            if row["unit_cost_pence"] != scenario["transfer_unit_cost_pence"]:
                violations.append("Transfer price differs from source assumption.")
            if row["arrival_days"] != scenario["transfer_lead_days"]:
                violations.append("Transfer arrival differs from source assumption.")
            costs += qty * scenario["transfer_unit_cost_pence"]
            outbound[row["sku"], row["from_hub"]] += qty
            incoming[key] += qty
            outgoing[row["sku"], row["from_hub"]] += qty
        else:
            violations.append("Unknown action type.")
    expected_keys = {(c["sku"], c["hub"]) for c in cells}
    actual_keys = [(a["sku"], a["hub"]) for a in plan["allocations"]]
    if len(actual_keys) != len(expected_keys) or set(actual_keys) != expected_keys:
        violations.append("Allocation cells are missing or duplicated.")
    if any((row["sku"], row["hub"]) not in expected_keys for row in plan["decisions"]):
        violations.append("Unknown product/warehouse action.")
    originals = {(c["sku"], c["hub"]): c for c in cells}
    for row in plan["allocations"]:
        key = row["sku"], row["hub"]
        cell = originals.get(key)
        if cell is None:
            continue
        for field in ("served", "shortfall", "ending_stock", "purchased", "transfer_in", "transfer_out"):
            if not isinstance(row[field], int) or row[field] < 0:
                violations.append(f"Noninteger/negative {field} at {key}.")
        if row["served"] + row["shortfall"] != cell["demand"]:
            violations.append(f"Demand balance failed at {key}.")
        if any(row[field] != cell[field] for field in ("demand", "initial_stock", "base_demand")):
            violations.append(f"Displayed source quantities differ at {key}.")
        available = cell["initial_stock"] + buy_by_cell[key] + incoming[key] - outgoing[key]
        if row["served"] + row["ending_stock"] != available:
            violations.append(f"Stock conservation failed at {key}.")
        if (row["purchased"], row["transfer_in"], row["transfer_out"]) != (buy_by_cell[key], incoming[key], outgoing[key]):
            violations.append(f"Action totals differ at {key}.")

    def limit(label, used, capacity, unit, minimum=False):
        slack = used - capacity if minimum else capacity - used
        ok = slack >= 0
        checks.append({"label": label, "used": used, "limit": capacity, "slack": slack,
                       "unit": unit, "minimum": minimum, "ok": ok, "at_limit": slack == 0})
        if not ok:
            violations.append(f"Constraint failed: {label}.")

    limit("Shared action budget", costs, parameters.budget_gbp * 100, "pence")
    limit("Transfer allowance", sum(outbound.values()), parameters.transfer_limit if parameters.allow_transfers else 0, "units")
    total = sum(c["demand"] for c in cells)
    limit("Minimum served units", sum(a["served"] for a in plan["allocations"]), math.ceil(total * parameters.minimum_service_pct / 100), "units", minimum=True)
    for hub in scenario["hubs"]:
        limit(f"{hub} receiving capacity", received[hub], scenario["receiving_capacity"][hub], "units")
    for offer in offers:
        limit(f"{offer['supplier']} / {offer['sku']}", supply[offer["supplier"], offer["sku"]], offer["available_capacity"], "units")
    for cell in cells:
        limit(f"Initial surplus / {cell['sku']} / {cell['hub']}", outbound[cell["sku"], cell["hub"]], max(cell["initial_stock"] - cell["demand"], 0), "units")
    if costs != plan["metrics"]["action_cost_pence"]:
        violations.append("Reported action cost differs from independent sum.")
    penalties = {p["sku"]: p["shortfall_penalty_pence"] for p in scenario["products"]}
    served = sum(a["served"] for a in plan["allocations"])
    shortfall = sum(a["shortfall"] for a in plan["allocations"])
    penalty = sum(a["shortfall"] * penalties[a["sku"]] for a in plan["allocations"] if a["sku"] in penalties)
    expected = {"demand": total, "served": served, "shortfall": shortfall,
                "objective_pence": costs + penalty, "shortfall_penalty_pence": penalty,
                "purchase_cost_pence": sum(r["units"] * r["unit_cost_pence"] for r in plan["decisions"] if r["kind"] == "purchase"),
                "transfer_cost_pence": sum(r["units"] * r["unit_cost_pence"] for r in plan["decisions"] if r["kind"] == "transfer"),
                "transferred_units": sum(outbound.values())}
    for name, value in expected.items():
        if plan["metrics"][name] != value:
            violations.append(f"Reported {name} differs from independent reconstruction.")
    if abs(plan["metrics"]["service_pct"] - 100 * served / total) > 1e-8:
        violations.append("Reported service percentage differs from allocation.")
    return {"valid": not violations, "violations": violations, "checks": checks,
            "note": "At-limit constraints are descriptive; zero slack alone is not a causal or economic bottleneck proof."}
