# Supply Chain Disruption Decision Brief

Scenario: Supplier outage
Run: 43c63f2e-b6b1-42b0-abed-f99ce4057d09
Created UTC: 2026-10-26T10:26:28.302109+00:00

## Scope
Seven-day, end-of-horizon allocation simulation. Historical sale counts inform assumed requirements; all stock, supplier and cost inputs are fictional (seed 42). This is not a forecast or real savings claim.

## Parameters
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

## Comparison
| Measure | Greedy baseline | Optimizer |
|---|---:|---:|
| Served units | 8,724 | 8,949 |
| Unmet units | 244 | 19 |
| Action spending GBP | 3,313.52 | 3,654.03 |
| Assumed penalty GBP | 2,542.98 | 221.92 |
| Model objective GBP | 5,856.50 | 3,875.95 |

Solver status: optimal. Baseline constraint-valid: True.
Model objective = action spending + assumed shortfall penalties. It is not measured company savings. The solver optimizes this objective, not service alone.

## Recommended actions for review
| Type | SKU | Origin / supplier | Destination | Units |
|---|---|---|---|---:|
| purchase | 21212 | Beacon | Central | 35 |
| purchase | 21212 | Beacon | South | 188 |
| purchase | 22197 | Beacon | North | 129 |
| purchase | 22197 | Beacon | South | 49 |
| purchase | 22197 | Cobalt | South | 122 |
| purchase | 22834 | Beacon | North | 14 |
| purchase | 22834 | Beacon | Central | 99 |
| purchase | 22834 | Cobalt | North | 17 |
| purchase | 84077 | Beacon | South | 280 |
| purchase | 85099B | Beacon | North | 231 |
| purchase | 85099B | Beacon | South | 7 |
| purchase | 85099B | Cobalt | South | 167 |
| purchase | 85123A | Beacon | Central | 296 |
| purchase | 85123A | Cobalt | North | 97 |
| purchase | 85123A | Cobalt | Central | 110 |
| transfer | 21212 | North | Central | 245 |
| transfer | 22834 | South | North | 85 |
| transfer | 84077 | North | Central | 364 |
| transfer | 84077 | North | South | 281 |
| transfer | 85099B | Central | North | 122 |
| transfer | 85123A | South | North | 103 |

## Physical supply bounds
| SKU | Required | Initial stock | Eligible supply capacity | Unavoidable unmet units (lower bound) |
|---|---:|---:|---:|---:|
| 21212 | 1377 | 1154 | 468 | 0 |
| 22197 | 888 | 749 | 302 | 0 |
| 22834 | 566 | 436 | 192 | 0 |
| 84077 | 3467 | 3393 | 1178 | 0 |
| 85099B | 1192 | 768 | 405 | 19 |
| 85123A | 1478 | 1078 | 503 | 0 |
These bounds ignore budget, receiving and transfer restrictions. A zero lower bound does not establish feasibility.

## Evidence
Input SHA-256: 7c9a86f69d08c241fd3807005923b7a24b2e95f531ef1c5fc95fbbf9b2908797
Scenario SHA-256: ee03291645349d162ecd399b077f67823b5d00a6c95de5ad4efe6169b7b119d7
Engine SHA-256: 8ba3d7a5681987ac532bcf13839fc4b46372260f3283d1586bfe488d64a93ad2
Public source SHA-256: a236999d5fd3429de9a2726aa69bdf73ca83256cf9ed5284db9fe35756e0715a

Source: Chen, D. (2015). Online Retail. UCI Machine Learning Repository. https://doi.org/10.24432/C5BW33. CC BY 4.0.

## Limits
No daily stockout timing, original-purchase matching, verified supplier data, uncertainty distribution, optimal real-world policy or automated order placement. Transfers use initial surplus only; new receipts cannot be forwarded. At-limit constraints alone do not prove causal bottlenecks.
