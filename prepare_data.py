"""Build deterministic fictional operational inputs around public sales counts."""
from pathlib import Path
import gzip
import hashlib
import json
import duckdb
import numpy as np

ROOT = Path(__file__).resolve().parent
SOURCE_SHA = "a236999d5fd3429de9a2726aa69bdf73ca83256cf9ed5284db9fe35756e0715a"


def build():
    source = ROOT / "data/retail_first_50000.csv.gz"
    if hashlib.sha256(gzip.decompress(source.read_bytes())).hexdigest() != SOURCE_SHA:
        raise ValueError("Public source checksum mismatch.")
    # Only a fixed project path enters this SQL; API users never supply SQL/paths.
    escaped = source.as_posix().replace("'", "''")
    with duckdb.connect() as db:
        db.execute(f"CREATE TABLE raw AS SELECT * FROM read_csv('{escaped}', all_varchar=true)")
        sql = (ROOT / "data/demand.sql").read_text(encoding="utf-8")
        rows = db.execute(sql).fetchall()
    rng = np.random.default_rng(42)
    hubs = ["North", "Central", "South"]
    products, inventory, offers = [], [], []
    for index, (sku, description, units) in enumerate(rows):
        # Split observed weekly units across fictional hubs; integer totals reconcile.
        shares = rng.dirichlet([5, 4, 3])
        demand = np.floor(shares * units).astype(int)
        demand[int(np.argmax(shares))] += units - int(demand.sum())
        base_cost = int(rng.integers(65, 240))
        priority = [2, 1, 3, 1, 2, 3][index]
        products.append({"sku": sku, "description": description, "observed_units": units,
                         "priority": priority, "shortfall_penalty_pence": base_cost * (4 + priority * 2)})
        factors = np.roll([1.45, .48, .36], index % 3)
        for hub, qty, factor in zip(hubs, demand, factors):
            inventory.append({"sku": sku, "hub": hub, "base_demand": int(qty), "initial_stock": int(round(qty * factor))})
        for supplier, fraction, markup, lead in [("Atlas", .26, 1.0, 2), ("Beacon", .20, 1.35, 4), ("Cobalt", .14, 1.75, 6)]:
            offers.append({"supplier": supplier, "sku": sku, "capacity": int(round(units * fraction)),
                           "unit_cost_pence": int(round(base_cost * markup)), "lead_days": lead})
    scenario = {"version": "f1.1", "seed": 42, "horizon_days": 7, "source_sha256": SOURCE_SHA,
                "demand_sql": sql, "demand_sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
                "historical_window": "2010-12-01 through 2010-12-07", "products": products, "inventory": inventory,
                "offers": offers, "hubs": hubs, "receiving_capacity": {h: 2000 for h in hubs},
                "transfer_unit_cost_pence": 35, "transfer_lead_days": 2,
                "provenance": "Only SKU codes, descriptions and observed_units are public observations. Every operational field is a seed-42 fictional planning assumption. Demand is not a forecast."}
    target = ROOT / "data/scenario.json"
    target.write_text(json.dumps(scenario, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(products)} products, {sum(p['observed_units'] for p in products):,} observed units; seed 42.")
    return scenario


if __name__ == "__main__":
    build()
