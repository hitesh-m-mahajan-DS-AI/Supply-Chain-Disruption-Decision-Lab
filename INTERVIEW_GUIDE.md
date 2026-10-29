# Explain F1 in an interview

## A 60-second introduction

I built a local decision-support app for supply disruptions. React and TypeScript handle the workflow; Python owns the calculations. I use a disclosed public retail subset for historical sale counts and clearly fictional operational assumptions. A greedy baseline and an integer optimizer share the same input contract. Independent code reconstructs stock, spending and capacity checks. In the default simulation, unmet requirements fall from 244 to 19 units, while action spending rises from £3,313.52 to £3,654.03. I report that trade-off and the 33.82% lower simulated objective without claiming real company savings.

## A three-minute walkthrough

1. Open Overview and run the supplier-outage demo. Explain which inputs are historical and which are fictional.
2. Compare the service and spending cards. Point out the objective's assumed penalties.
3. Read the physical supply limit for SKU 85099B: 768 initial units + 405 eligible supplier units versus 1,192 required, leaving a lower bound of 19 unmet units.
4. Open Budget sensitivity. £7,500 gives the same default result as £5,000 while other inputs stay fixed.
5. Open Action plan and Constraint checks. Explain conservation and why a zero-capacity offer also has zero slack.
6. Open Data & evidence and inspect the SQL and fingerprint. Export the decision brief and full JSON.
7. Run Impossible service target. Show unavailable optimizer metrics and the baseline's failed service-floor check.
8. Reopen a saved run. Change an input and show the notice that exports still refer to the saved snapshot.

## Questions to prepare for

**Why optimization instead of ML?** The task is choosing actions under stated constraints. There is no labelled dataset of optimal real decisions. The model solves a specified allocation problem, not a learned prediction task.

**Why a simple baseline?** It creates a clear comparison with a rule someone can understand. Its iteration order is disclosed; it is not presented as the best possible heuristic.

**Does optimal mean best in the real world?** No. It means optimal for this mathematical model and its assumptions when the solver proves that status. Costs, requirements, constraints and timing would need operational validation.

**Why is spending higher?** Avoiding shortfalls has an assumed penalty. The objective trades spending against that penalty. Spending and objective are different measures.

**How is leakage avoided?** This is not a predictive model. Historical counts are openly used as a fictional requirement profile; no forecast accuracy or future-period generalization is claimed.

**How is the result checked?** Separate code reconstructs the physical and financial constraints from action rows. Tests also solve a tiny problem by exhaustive enumeration and deliberately corrupt plan data.

**What happens when the model cannot satisfy a target?** No optimizer metrics are invented. The failed scenario and baseline checks remain available, with guidance on which assumptions the user could reconsider.

**What would a real deployment require?** Verified inventory/supplier data, daily arrival and consumption timing, validated costs, authenticated multi-user access, capacity planning, suitable storage/concurrency and operational review. None of those are established by this laptop demonstration.

**What did you learn?** Explicit optimization modelling, a typed frontend/backend contract, local persistence, reproducibility fingerprints, meaningful testing and communicating the boundary between observed data and scenario assumptions.
