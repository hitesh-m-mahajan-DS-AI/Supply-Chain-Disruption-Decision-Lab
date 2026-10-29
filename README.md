# Supply Chain Disruption Decision Lab — F1

A local constrained-allocation application comparing a deterministic procurement/transfer heuristic with an independently audited mixed-integer model, including scenario controls, budget counterfactuals and durable decision snapshots.

> Model boundary: public historical sale counts inform illustrative requirements; inventory, supplier offers, capacities and penalties are fictional assumptions. Objective improvements are simulated trade-offs, not measured savings.

## Contents

- [Overview](#overview)
- [Dataset and data contract](#dataset-and-data-contract)
- [Architecture and components](#architecture-and-components)
- [Processing pipeline](#processing-pipeline)
- [Configuration and metric definitions](#configuration-and-metric-definitions)
- [Recorded results and evidence](#recorded-results-and-evidence)
- [Interpretation and operational use](#interpretation-and-operational-use)
- [Running locally](#running-locally)
- [API reference](#api-reference)
- [Validation and reproducibility](#validation-and-reproducibility)
- [Project structure](#project-structure)
- [Technology stack](#technology-stack)
- [Limitations and next steps](#limitations-and-next-steps)
- [Further technical documentation](#further-technical-documentation)

## Overview

**A supplier cannot deliver within our planning horizon. How should we allocate stock, buy alternatives and transfer surplus while respecting budget and capacity limits?**

The app has six navigable sections: **Overview → Design scenario → Compare plans → Data & evidence → Saved runs → Method & model**. Five editable presets cover normal operations, supplier outage, demand surge, zero budget and an impossible service target. A comparison saves automatically and can be exported as a decision brief, action CSV or complete JSON snapshot.

## Dataset and data contract

**Observed inputs:** six SKU codes, descriptions and historical positive-sale counts from [UCI Online Retail](https://archive.ics.uci.edu/dataset/352/online+retail). Citation: Chen, D. (2015). Online Retail [Dataset]. UCI Machine Learning Repository. [DOI: 10.24432/C5BW33](https://doi.org/10.24432/C5BW33). License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The full dataset contains 541,909 transaction lines. This repository bundles only its **first 50,000 source rows** in a small compressed CSV, preserving the source fields plus a row identifier. Fixed DuckDB SQL selects six SKUs from **1–7 December 2010**, excluding later exact repeats, cancellation-marked invoices and nonpositive quantities/prices. The selected historical counts total **8,968 units**. The prefix and six selected products are not representative annual demand; exact-repeat quarantine is an analytical choice and can exclude legitimate repeated lines.

**Fictional operational inputs:** all warehouse splits, stock, supplier capacities/costs, priorities, penalties and lead times are generated or explicitly specified using **seed 42**. Three fictional hubs and suppliers have no real operational meaning. The historical profile supplies an illustrative requirement scenario, **not a forecast**. No supplier or inventory information is inferred from retail transactions.

| Input | Meaning |
|---|---|
| sku, description, observed_units | Public product observations after the disclosed SQL transformation |
| base_demand by hub | Fictional split of those units across North/Central/South |
| initial_stock | Fictional starting inventory, fixed as scenario controls change |
| supplier/SKU capacity, price, lead_days | Fictional independent offers from Atlas, Beacon and Cobalt |
| receiving_capacity | Maximum inbound purchase + transfer units at each hub |
| priority / shortfall_penalty_pence | Assumed per-SKU priority and penalty; not calibrated risk or measured lost profit |
| transfer rules | Initial-surplus transfers, 35p/unit, two-day arrival, shared transfer allowance |
| user parameters | Budget, disabled supplier, capacity multiplier, added delay, requirement multiplier, transfer switch/limit, service floor |

All assumptions are in [scenario.json](data/scenario.json); [SOURCE.md](data/SOURCE.md) records provenance, SHA-256 checksums and policy choices. [demand.sql](data/demand.sql) and [prepare_data.py](prepare_data.py) reproduce the fixture from the bundled source. No other project is needed.

## Architecture and components

```mermaid
flowchart LR
    N0["Bundled retail prefix and DuckDB SQL"]
    N1["Operational fixture and strict request"]
    N2["Greedy baseline and HiGHS MILP"]
    N3["Independent stock and cost audit"]
    N4["DuckDB saved snapshot"]
    N5["React comparison and evidence exports"]
    N0 --> N1 --> N2 --> N3 --> N4 --> N5
```

| Component | Entry points or assets | Responsibility |
|---|---|---|
| [prepare_data.py](prepare_data.py) | Fixture preparation | Apply the fixed DuckDB query and construct explicitly fictional operational assumptions. |
| [backend/contracts.py](backend/contracts.py) | Parameters / PRESETS | Define strict bounded controls and five reproducible scenarios. |
| [backend/planner.py](backend/planner.py) | Baseline and MILP | Apply offer eligibility, allocate stock/purchases/transfers and solve the integer model. |
| [backend/audit.py](backend/audit.py) | Independent reconstruction | Rebuild physical/cost totals and expose the 42 model-limit checks. |
| [backend/service.py](backend/service.py) | Run orchestration | Capture fingerprints, sensitivity results, physical bounds and immutable evidence. |
| [backend/store.py](backend/store.py) | Local DuckDB history | Persist and reopen saved run snapshots under a process lock. |
| [backend/api.py](backend/api.py) | HTTP and static serving | Provide the contract and exports on the same origin as the built interface. |
| [frontend/src/App.tsx](frontend/src/App.tsx) | React workflow | Manage scenario drafts, comparisons, saved results and explicit solver-status presentation. |

## Processing pipeline

1. Verify the public source checksum, use fixed demand SQL, and prepare the operational fixture with seed 42. Embed the transformation SQL/hash in the fixture so an unreviewed SQL change cannot silently describe old requirements.
2. Validate bounded requests with Pydantic: strict types, no unknown fields and a nonblank scenario name. Round scaled per-hub/SKU requirements upward; retain the integer total visibly.
3. Apply offer eligibility: disable the chosen supplier(s), remove arrivals after day seven, and floor remaining capacity after the requested percentage reduction.
4. Calculate the deterministic baseline: use own stock, transfer surplus in SKU/hub order, then purchase in SKU/hub order from cheapest available offers.
5. Use [SciPy/HiGHS mixed-integer optimization](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html) to minimize **purchase costs + transfer costs + assumed shortfall penalties**. Enforce stock conservation, supplier/SKU capacities, receiving limits, shared spending, transfer allowance and an optional minimum-service constraint. The solver has a five-second limit per solve.
6. Independently reconstruct action costs and stock/demand balances without reusing the MILP matrix. Reject nonintegral or invalid solver results. Expose all **42 limit checks**, including failed baseline service floors. An at-limit constraint alone is not called a causal bottleneck.
7. Solve a few budget counterfactuals, holding other parameters fixed. Compute a conservative physical shortage lower bound per SKU from total starting stock plus eligible supplier capacity.
8. Save a local DuckDB snapshot: parameters, operational data, both plans, checks, counterfactuals, physical bounds, SQL, hashes and runtime versions. Keep browser edits separate from the saved result so exports never silently change with a draft.

Only the server owns business calculations. ECharts renders actual returned results and loads lazily; the same localhost server serves the built React interface and the API. [Architecture and model formulation](ARCHITECTURE.md) explain every layer and limitation.

## Configuration and metric definitions

### Objective and conservation

```text
minimize purchase_spend + transfer_spend + assumed_shortfall_penalty

for each SKU and hub:
  served + unmet = requirement
  served + ending_stock + outbound - inbound - purchases = initial_stock
  outbound <= max(initial_stock - local_requirement, 0)
```

| Control | Supported range or rule |
|---|---|
| Requirement multiplier | 50-180%; scaled SKU/hub requirements rounded upward |
| Shared action budget | £0-£30,000; purchases and transfers share the allowance |
| Disabled supplier | None, Atlas, Beacon, Cobalt or All |
| Supplier capacity multiplier | 0-100%; resulting quantities rounded downward |
| Extra lead time | 0-10 days; arrivals after the seven-day horizon are ineligible |
| Transfers | Enabled/disabled; 0-5,000-unit allowance; initial surplus only |
| Minimum service | 0-100% global served-unit floor |
| Solver limit | Five seconds per solve; status distinguishes optimal, feasible incumbent, infeasible and not solved |

Money is reconstructed in integer pennies. Each supplier/SKU has an independent capacity; receiving limits aggregate incoming actions. An infeasible or unauditable plan has no invented optimizer metrics. A positive physical shortage lower bound proves insufficient aggregate supply under the assumptions; zero does not prove a feasible plan exists.

## Recorded results and evidence

The following values were computed end to end using the **Supplier outage** preset: Atlas unavailable, £5,000 shared action budget, 100% requirements, 1,200-unit transfer allowance, no extra supplier delay, and no minimum-service floor.

| Measure | Greedy baseline | Optimizer |
|---|---:|---:|
| Required units | 8,968 | 8,968 |
| Served units | 8,724 | **8,949** |
| Unmet units | 244 | **19** |
| Fulfilment at deadline | 97.28% | **99.79%** |
| Purchase spending | £2,893.52 | £3,234.03 |
| Transfer spending | £420.00 | £420.00 |
| Total action spending | **£3,313.52** | **£3,654.03** |
| Assumed shortfall penalty | £2,542.98 | £221.92 |
| Model objective | £5,856.50 | £3,875.95 |
| Transferred units | 1,200 | 1,200 |
| Independent audit | Passed | Passed |
| Method status | Heuristic | Proven optimal for this model |

The optimizer serves **225 additional units** while spending **£340.51 more**. Its objective is **33.82% lower** because the assumed shortage penalty falls. **This is a simulated trade-off, not actual company savings.** The objective does not directly maximize fulfilment or minimize spending alone.

![Actual saved default comparison and budget sensitivity](outputs/comparison.png)

The remaining shortage has a direct physical bound: SKU **85099B** requires **1,192 units**, but has **768 starting units + 405 eligible supplier units = 1,173 available units**. At least **19 units** must remain unmet under those supply assumptions, regardless of extra budget. Other constraints can only worsen that lower bound. A zero shortage lower bound for another SKU does not prove feasibility.

| Counterfactual budget | Optimizer served | Unmet | Actual action spending |
|---|---:|---:|---:|
| £0 | 5,908 | 3,060 | £0.00 |
| £2,500 | 8,259 | 709 | £2,499.93 |
| £5,000 | 8,949 | 19 | £3,654.03 |
| £7,500 | 8,949 | 19 | £3,654.03 |

Only budget changes in this table. A higher budget is a limit, not an instruction to spend it all. Under the fixed remaining assumptions, increasing it from £5,000 to £7,500 does not change the optimized metrics.

Other actual preset results: normal operations serve all 8,968 units with £2,784.01 optimizer action spending; the surge scenario serves 10,211 of 12,562 illustrative required units; zero budget permits no paid actions. The impossible-service preset is **infeasible**, so optimizer metrics are **unavailable**. Its baseline fails the required service floor and is not presented as a feasible comparison.

[Application screenshot](outputs/results.png)

Saved evidence: [complete default snapshot](outputs/default_run.json), [all five scenario results](outputs/scenario_results.csv), [budget sensitivity](outputs/budget_sensitivity.json), [optimizer allocation](outputs/optimized_allocations.csv), [optimizer actions](outputs/optimized_decisions.csv), [baseline allocation](outputs/baseline_allocations.csv), [baseline actions](outputs/baseline_decisions.csv), [decision brief](outputs/decision_brief.md) and [verification record](outputs/verification.md). Additional browser captures show [Overview](outputs/overview.png), [scenario controls](outputs/scenario.png) and [infeasibility](outputs/infeasible.png).

## Interpretation and operational use

- **Review the missing supply before increasing budget:** SKU 85099B has a 19-unit physical supply deficit. Investigate an additional eligible source, greater supplier capacity or a revised requirement; funding alone cannot create units within the fixed model.
- **Make the trade-off explicit:** the optimizer spends an extra £340.51 to serve 225 more units in this scenario. Validate real action costs and shortage consequences before adopting a comparable policy in a business.
- **Keep failed scenarios visible:** a service floor can be impossible. Preserve the assumptions and failed checks, and reconsider them explicitly instead of reporting a fabricated plan or an invalid baseline as feasible.

## Running locally

The three setup/launch commands below start at the repository root.

Prerequisites: **Python 3.12+ and a Vite-compatible Node.js installation**. Verified here with Python 3.12, Node **25.2.0** and npm **11.19.0**. Initial setup downloads free packages; normal application use requires no internet, account, key, cloud service, GPU or database server.

```powershell
cd projects/f1-supply-chain-disruption-lab
python setup_project.py
python launch.py
```

Open **http://127.0.0.1:8530**, then choose **Run supplier-outage demo**. setup_project.py creates this project's ignored `.venv`, installs pinned/constrained Python packages, runs `npm ci` and builds the interface. It was tested from a fresh project environment. Setup is normally one-time; later use only `python launch.py`. Ctrl+C stops the server. If the port is already in use, `python launch.py --port 8531` selects another local port. No system service or startup registration is installed.

The raw bundle and prepared scenario are included. Optional developer commands, separate from launching: `.venv/Scripts/python.exe -m unittest discover -s tests -v` runs the checks; `.venv/Scripts/python.exe evaluate.py` regenerates evidence; `.venv/Scripts/python.exe prepare_data.py` rebuilds the fixture. Restart the server after changing backend code or prepared data. The supported default is the built single-origin app.

Saved runs live in ignored `runtime/runs.duckdb`. They survive restart and are not committed. The UI lists the latest 100 and provides exports. The API contract is available locally at `/openapi.json`. Generated environment, npm dependencies and built assets stay outside Git. [PROJECT_FILES.md](PROJECT_FILES.md) contains the folder structure and copyable source blocks.

## API reference

The interface and API share one localhost origin. Route declarations are implemented in [backend/api.py](backend/api.py); `/openapi.json` exposes the generated schemas.

| Method | Route | Handler |
|---|---|---|
| GET | `/api/health` | `health` |
| GET | `/api/catalog` | `catalog` |
| POST | `/api/runs` | `create_run` |
| GET | `/api/runs` | `runs` |
| GET | `/api/runs/{run_id}` | `run_detail` |
| GET | `/api/runs/{run_id}/export/{kind}` | `export` |

### Scenario request

Example body for `POST /api/runs`:

```json
{
  "name": "Supplier outage",
  "demand_pct": 100,
  "budget_gbp": 5000,
  "disrupted_supplier": "Atlas",
  "supplier_capacity_pct": 100,
  "extra_lead_days": 0,
  "allow_transfers": true,
  "transfer_limit": 1200,
  "minimum_service_pct": 0
}
```

Valid comparisons receive HTTP 201 and a run identity, including scenarios whose optimizer status is infeasible. Invalid request fields return 422; integrity-check failures return 503 without saving a run. The export kind is `json`, `md` or `csv`; a well-formed but unknown run UUID returns 404.

The server is intended for a trusted single-user local environment. These routes do not constitute an authenticated public deployment. Saved output identifiers refer to immutable analytical snapshots rather than editable browser drafts.

## Validation and reproducibility

The automated suite contains **14 tests**. It checks the following implementation boundaries:

Test implementation: [tests/test_planning.py](tests/test_planning.py).

- Exhaustive one product optimum.
- Two hub transfer conservation and budget.
- Zero budget prevents paid actions.
- Late and disrupted offers cannot supply.
- Impossible service target is explicit.
- All presets reconcile and do not overstate comparison.
- Independent audit rejects corrupted stock and metrics.
- Receiving cap and transfer switch.
- Repeat inputs preserve objective and fingerprints.
- Valid optimizer with invalid service floor baseline.
- Time limit without incumbent is not called infeasible.
- Source preparation is deterministic.
- Physical supply lower bound explains default shortfall.
- Api validation save reopen and exports.

From the project directory, run:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

Recorded execution and any browser-review evidence is retained in [outputs/verification.md](outputs/verification.md). Reported figures correspond to saved execution artifacts; running a report generator can overwrite its generated outputs. Package requirements, source checksums and fixed parameters define the reproducibility boundary; elapsed times and some model/solver outputs can vary across environments. The setup script also performs TypeScript checking and a production frontend build using the npm lockfile.

## Project structure

```text
f1-supply-chain-disruption-lab/
  ARCHITECTURE.md
  constraints.txt
  evaluate.py
  INTERVIEW_GUIDE.md
  launch.py
  prepare_data.py
  PROJECT_FILES.md
  README.md
  requirements.txt
  setup_project.py
  backend/
    __init__.py
    api.py
    audit.py
    contracts.py
    planner.py
    service.py
    store.py
  frontend/
    package.json
    package-lock.json
    tsconfig.json
    index.html
    src/
      App.tsx
      Chart.tsx
      EChart.tsx
      main.tsx
      styles.css
      types.ts
      vite-env.d.ts
  tests/
    __init__.py
    test_planning.py
  data/
    Bundled inputs, provenance and prepared data
  outputs/
    Recorded metrics, audit files, tables and figures
```

Generated environments, database files, model artifacts and compiled assets follow the project's [.gitignore](.gitignore). The [copyable source bundle](PROJECT_FILES.md) mirrors the README and contains individual file blocks.

## Technology stack

**Interface:** React 19.3.1, TypeScript 7.0.2, Vite 8.3.5, Apache ECharts 6.1.0, Lucide React 1.61.0 and custom CSS. **API and model:** Python, FastAPI, Pydantic, Uvicorn, NumPy, SciPy/HiGHS and DuckDB. **Evidence/checks:** matplotlib, unittest, FastAPI TestClient and an exhaustive tiny optimization fixture. Python direct requirements, transitive constraints and npm lockfile record the tested versions.

## Limitations and next steps

- Historical sales from a small holiday-period subset supply a fictional requirement scenario. They do not establish future demand, annual representativeness, unmet customer demand or actual inventory.
- Operational inputs and cost/penalty weights are assumed. The optimized objective is meaningful only within those assumptions. Sensitivity explores a few budgets, not uncertainty or robustness across a validated probability distribution.
- One seven-day deadline is modelled. There is no daily time-indexed inventory, early-week service guarantee, routing, travel network, multi-leg arrival scheduling, safety stock, minimum order quantity, supplier-wide shared capacity or storage-volume model.
- Transfers are conservatively limited to initial stock above the origin's full local requirement. New receipts cannot be forwarded. Units from different SKUs are not substitutes.
- All 18 supplier/SKU capacities are independent and receiving limits aggregate all incoming action units. Real operations would need verified capacity definitions and an authoritative item/unit catalogue.
- The baseline's fixed order is simple and can affect its result; it is not the strongest possible heuristic. It may fail a hard service floor, which is explicitly flagged. No improvement percentage is then reported.
- The mathematical optimum is not a guarantee of an optimal real policy. A time-limited solution is labelled accordingly; multiple equivalent optima may produce different decisions between library versions.
- Local single-user operation is the intended scope. There is no authentication, distributed worker system, concurrent multi-process database support, hosted CI or cloud deployment claim. No real procurement action is executed.
- Desktop browser flows and the production build were verified. Responsive CSS is supplied; no separate mobile-device performance or accessibility certification is claimed.
- Future improvements should begin with validated daily demand/stock/supplier data and operating rules, then time-indexed modelling and broader sensitivity. The [architecture reference](ARCHITECTURE.md) explains these boundaries.

## Further technical documentation

- [Dataset attribution, licensing and source transformations](data/SOURCE.md)
- [Pinned Python dependencies](requirements.txt)
- [Recorded transitive dependency constraints](constraints.txt)
- [Frontend dependency lockfile](frontend/package-lock.json)
- [Detailed architecture, contracts and implementation boundaries](ARCHITECTURE.md)
- [Recorded execution and verification evidence](outputs/verification.md)
- [Folder structure and individually copyable source files](PROJECT_FILES.md)

[Back to contents](#contents)
