"""Regenerate actual portfolio evidence without starting a server or writing history."""
from pathlib import Path
import csv
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from backend.contracts import PRESETS, Parameters
from backend.service import make_run, load_scenario, brief

ROOT = Path(__file__).resolve().parent


def evaluate():
    output = ROOT / "outputs"
    output.mkdir(exist_ok=True)
    scenario = load_scenario()
    runs = [make_run(scenario, Parameters(**preset["parameters"])) for preset in PRESETS]
    rows = []
    for preset, run in zip(PRESETS, runs):
        for name in ["baseline", "optimized"]:
            plan = run[name]
            rows.append({"scenario": preset["id"], "method": name, "status": plan["status"],
                         "constraint_valid": plan["audit"]["valid"] if plan["audit"] else None,
                         **(plan["metrics"] or {}), "solver_seconds": plan["seconds"]})
    columns = list(rows[0])
    with (output / "scenario_results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    default = runs[0]
    (output / "default_run.json").write_text(json.dumps(default, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (output / "decision_brief.md").write_text(brief(default), encoding="utf-8")
    (output / "budget_sensitivity.json").write_text(json.dumps(default["budget_sensitivity"], indent=2) + "\n", encoding="utf-8")
    for name in ["baseline", "optimized"]:
        plan = default[name]
        for label in ["allocations", "decisions"]:
            data = plan[label]
            columns = sorted(set().union(*(row.keys() for row in data)))
            with (output / f"{name}_{label}.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns)
                writer.writeheader()
                writer.writerows(data)
    b, o = default["baseline"]["metrics"], default["optimized"]["metrics"]
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.8), layout="constrained")
    names = ["Greedy baseline", "Optimizer"]
    axes[0].bar(names, [b["shortfall"], o["shortfall"]], color=["#a8b8b2", "#12756c"])
    axes[0].set(title="Unmet requirements at the deadline", ylabel="Units")
    for index, plan in enumerate([b, o]):
        axes[0].text(index, plan["shortfall"] + 3, str(plan["shortfall"]), ha="center")
    action = [b["action_cost_pence"] / 100, o["action_cost_pence"] / 100]
    penalty = [b["shortfall_penalty_pence"] / 100, o["shortfall_penalty_pence"] / 100]
    axes[1].bar(names, action, color="#12756c", label="Action spending")
    axes[1].bar(names, penalty, bottom=action, color="#dda64a", label="Assumed shortfall penalty")
    axes[1].set(title="Model objective components", ylabel="GBP (scenario assumptions)")
    axes[1].legend(fontsize=8)
    sensitivity = default["budget_sensitivity"]
    axes[2].plot([r["budget_gbp"] for r in sensitivity], [r["metrics"]["service_pct"] if r["metrics"] else float("nan") for r in sensitivity], marker="o", color="#12756c")
    axes[2].set(title="Budget sensitivity: other inputs fixed", xlabel="Shared action budget (GBP)", ylabel="Fulfilment (%)", ylim=(0, 105))
    fig.suptitle("Supply Chain Disruption Decision Lab · Supplier-outage simulation · Not real company savings", fontsize=13)
    fig.savefig(output / "comparison.png", dpi=150)
    plt.close(fig)
    print(json.dumps({"baseline": b, "optimized": o, "objective_reduction_pct": default["objective_reduction_pct"],
                      "sensitivity": sensitivity}, indent=2))
    return default


if __name__ == "__main__":
    evaluate()
