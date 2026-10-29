"""Check decisions against hand calculations, exhaustive search and failure cases."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from types import SimpleNamespace
import json
import unittest
from fastapi.testclient import TestClient
from backend.contracts import Parameters, PRESETS
from backend.planner import greedy, optimize, planning_inputs
from backend.audit import audit_plan
from backend.service import load_scenario, make_run
from backend import store
from backend.api import app


def toy():
    return {"horizon_days": 7, "hubs": ["North"], "receiving_capacity": {"North": 10},
            "transfer_unit_cost_pence": 35, "transfer_lead_days": 2,
            "products": [{"sku": "A", "shortfall_penalty_pence": 1000}],
            "inventory": [{"sku": "A", "hub": "North", "base_demand": 4, "initial_stock": 1}],
            "offers": [{"supplier": "Atlas", "sku": "A", "capacity": 5, "unit_cost_pence": 200, "lead_days": 2}]}


class PlanningChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scenario = load_scenario()

    def test_exhaustive_one_product_optimum(self):
        scenario = toy()
        p = Parameters(disrupted_supplier="None", budget_gbp=4)
        result = optimize(scenario, p)
        possibilities = [(q * 200 + max(4 - 1 - q, 0) * 1000, q) for q in range(6) if q * 200 <= 400]
        objective, qty = min(possibilities)
        self.assertEqual((objective, qty), (1400, 2))
        self.assertEqual(result["metrics"]["objective_pence"], objective)
        self.assertEqual(result["metrics"]["served"], 3)
        self.assertTrue(result["audit"]["valid"])

    def test_two_hub_transfer_conservation_and_budget(self):
        scenario = toy()
        scenario["hubs"] = ["North", "South"]
        scenario["receiving_capacity"]["South"] = 10
        scenario["inventory"] = [{"sku": "A", "hub": "North", "base_demand": 1, "initial_stock": 4},
                                 {"sku": "A", "hub": "South", "base_demand": 4, "initial_stock": 0}]
        result = optimize(scenario, Parameters(disrupted_supplier="All", budget_gbp=1, transfer_limit=2))
        self.assertEqual(result["metrics"]["transferred_units"], 2)
        self.assertEqual(result["metrics"]["served"], 3)
        self.assertEqual(result["metrics"]["action_cost_pence"], 70)
        self.assertEqual(sum(a["ending_stock"] for a in result["allocations"]), 1)
        self.assertTrue(result["audit"]["valid"])

    def test_zero_budget_prevents_paid_actions(self):
        p = Parameters(budget_gbp=0)
        for method in [greedy, optimize]:
            plan = method(self.scenario, p)
            self.assertEqual(plan["decisions"], [])
            self.assertEqual(plan["metrics"]["action_cost_pence"], 0)
            self.assertTrue(plan["audit"]["valid"])

    def test_late_and_disrupted_offers_cannot_supply(self):
        scenario = toy()
        result = optimize(scenario, Parameters(disrupted_supplier="None", extra_lead_days=6))
        self.assertEqual(result["metrics"]["served"], 1)
        self.assertEqual(result["decisions"], [])
        result = optimize(scenario, Parameters(disrupted_supplier="Atlas"))
        self.assertEqual(result["metrics"]["served"], 1)

    def test_impossible_service_target_is_explicit(self):
        p = Parameters(**PRESETS[-1]["parameters"])
        result = optimize(self.scenario, p)
        self.assertEqual(result["status"], "infeasible")
        self.assertIsNone(result["metrics"])
        self.assertFalse(greedy(self.scenario, p)["audit"]["valid"])

    def test_all_presets_reconcile_and_do_not_overstate_comparison(self):
        for preset in PRESETS:
            with self.subTest(preset=preset["id"]):
                p = Parameters(**preset["parameters"])
                run = make_run(self.scenario, p)
                if run["optimized"]["metrics"]:
                    self.assertTrue(run["optimized"]["audit"]["valid"])
                    if run["comparable"]:
                        self.assertLessEqual(run["optimized"]["metrics"]["objective_pence"], run["baseline"]["metrics"]["objective_pence"])
                else:
                    self.assertIsNone(run["objective_reduction_pct"])

    def test_independent_audit_rejects_corrupted_stock_and_metrics(self):
        p = Parameters()
        plan = optimize(self.scenario, p)
        cells, offers = planning_inputs(self.scenario, p)
        bad = deepcopy(plan)
        bad["allocations"][0]["ending_stock"] += 1
        self.assertFalse(audit_plan(self.scenario, p, cells, offers, bad)["valid"])
        bad = deepcopy(plan)
        bad["metrics"]["objective_pence"] -= 100
        self.assertFalse(audit_plan(self.scenario, p, cells, offers, bad)["valid"])

    def test_receiving_cap_and_transfer_switch(self):
        scenario = toy()
        scenario["receiving_capacity"]["North"] = 1
        result = optimize(scenario, Parameters(disrupted_supplier="None", allow_transfers=False))
        self.assertEqual(result["metrics"]["served"], 2)
        self.assertEqual(result["metrics"]["transferred_units"], 0)
        self.assertTrue(result["audit"]["valid"])

    def test_repeat_inputs_preserve_objective_and_fingerprints(self):
        first = make_run(self.scenario, Parameters())
        second = make_run(self.scenario, Parameters())
        self.assertEqual(first["input_sha256"], second["input_sha256"])
        self.assertEqual(first["optimized"]["metrics"], second["optimized"]["metrics"])
        self.assertNotEqual(first["id"], second["id"])

    def test_valid_optimizer_with_invalid_service_floor_baseline(self):
        run = make_run(self.scenario, Parameters(minimum_service_pct=99))
        self.assertTrue(run["optimized"]["audit"]["valid"])
        self.assertFalse(run["baseline"]["audit"]["valid"])
        self.assertFalse(run["comparable"])
        self.assertIsNone(run["objective_reduction_pct"])

    def test_time_limit_without_incumbent_is_not_called_infeasible(self):
        timed_out = SimpleNamespace(x=None, status=1, message="Time limit reached")
        with patch("backend.planner.milp", return_value=timed_out):
            result = optimize(toy(), Parameters())
        self.assertEqual(result["status"], "not_solved")
        self.assertIsNone(result["metrics"])

    def test_source_preparation_is_deterministic(self):
        from prepare_data import build
        expected = json.loads((Path(__file__).resolve().parents[1] / "data/scenario.json").read_text(encoding="utf-8"))
        self.assertEqual(build(), expected)

    def test_physical_supply_lower_bound_explains_default_shortfall(self):
        run = make_run(self.scenario, Parameters())
        row = next(r for r in run["supply_bounds"] if r["sku"] == "85099B")
        self.assertEqual((row["required"], row["initial_stock"], row["eligible_supplier_capacity"]), (1192, 768, 405))
        self.assertEqual(row["minimum_unmet_from_supply"], 19)
        self.assertEqual(sum(r["minimum_unmet_from_supply"] for r in run["supply_bounds"]), run["optimized"]["metrics"]["shortfall"])

    def test_api_validation_save_reopen_and_exports(self):
        with TemporaryDirectory() as folder, patch.object(store, "ROOT", Path(folder)), TestClient(app) as client:
            self.assertEqual(client.get("/api/health").status_code, 200)
            self.assertEqual(len(client.get("/api/catalog").json()["scenario"]["products"]), 6)
            for invalid in [{"budget_gbp": -1}, {"extra": 1}, {"budget_gbp": 1.5}, {"name": "   "}]:
                self.assertEqual(client.post("/api/runs", json=invalid).status_code, 422)
            self.assertEqual(client.get("/api/runs").json(), [])
            created = client.post("/api/runs", json=Parameters().model_dump())
            self.assertEqual(created.status_code, 201)
            run = created.json()
            self.assertTrue(run["optimized"]["audit"]["valid"])
            self.assertEqual(client.get(f"/api/runs/{run['id']}").json(), run)
            self.assertEqual(len(client.get("/api/runs").json()), 1)
            self.assertEqual(client.get(f"/api/runs/{run['id']}/export/json").json(), run)
            self.assertIn(run["input_sha256"], client.get(f"/api/runs/{run['id']}/export/md").text)
            self.assertIn("unit_cost_pence", client.get(f"/api/runs/{run['id']}/export/csv").text)
            self.assertEqual(client.get("/api/runs/not-a-uuid").status_code, 422)
            self.assertEqual(client.get("/api/runs/00000000-0000-0000-0000-000000000000").status_code, 404)
            # New connections read the actual durable database, not an in-memory cache.
            with TestClient(app) as reopened:
                self.assertEqual(reopened.get(f"/api/runs/{run['id']}").json(), run)


if __name__ == "__main__":
    unittest.main(verbosity=2)
