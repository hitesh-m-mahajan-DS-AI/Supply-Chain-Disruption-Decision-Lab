# Sources, transformations and fictional assumptions

**Observed source:** Chen, D. (2015). Online Retail [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5BW33. [Dataset page](https://archive.ics.uci.edu/dataset/352/online+retail). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The original contains 541,909 transaction lines. The bundled `retail_first_50000.csv.gz` contains the first 50,000 data rows in original workbook order, all eight original fields, and the added `source_row` traceability field. It is a deterministic teaching prefix, not a representative annual sample. The final prefix day is partial; the selected 1–7 December window precedes that boundary. Original workbook row 50,001 starts a new invoice. Customer identifiers are source pseudonymous fields and are not used or exposed by this app.

- Official no-login archive: https://archive.ics.uci.edu/static/public/352/online%2Bretail.zip.
- Original ZIP SHA-256: `f5385cbb54bbebf7196389109c6b0621faab0c304e3702548165e71c84aede8b`.
- Original `Online Retail.xlsx` SHA-256: `43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d`.
- Bundled decompressed CSV SHA-256: `a236999d5fd3429de9a2726aa69bdf73ca83256cf9ed5284db9fe35756e0715a`.
- The same public prefix is also used elsewhere in the portfolio, but this project contains its own copy and has no cross-project imports or runtime dependency.

`demand.sql` quarantines later exact repeats of the eight original fields, preserves the first by source_row, and selects positive-quantity, positive-price, non-C transaction lines from 1 December 2010 inclusive to 8 December exclusive for six fixed SKUs. Identical lines may be legitimate; quarantine is an analytical choice. Negative/cancellation lines are not treated as demand or matched to purchases. Minimum alphabetical description per code is a display label, not the grouping key. This produces:

| SKU | Observed sale units |
|---|---:|
| 21212 | 1,377 |
| 22197 | 888 |
| 22834 | 566 |
| 84077 | 3,467 |
| 85099B | 1,192 |
| 85123A | 1,478 |
| Total | **8,968** |

**Every operational field is fictional.** `prepare_data.py` uses NumPy's generator with seed 42 to split each SKU's units across North/Central/South hubs using Dirichlet shares and reconcile integer totals. It rotates stock factors 1.45/0.48/0.36 across hubs, generates base purchase costs, and specifies priority multipliers, supplier capacity fractions, cost markups and arrival times. `scenario.json` stores the complete result. Three suppliers are fictional: Atlas, Beacon and Cobalt. Their names imply no real organization or measured reliability.

The explicit fixed policy inputs include a seven-day deadline, 2,000-unit receiving capacity per hub, 35p per transferred unit and two-day transfers. Supplier lead times are 2/4/6 days before the user-added delay. Shortfall penalties are not revenue, profit or verified lost-sales costs. Supplier capacities are separate by SKU; there is no additional shared supplier-wide capacity assumption.

Scenario demand is an illustrative requirement profile, **not a forecast of future demand**. Changing its multiplier applies a ceiling to each hub/SKU quantity, so non-100% totals include disclosed integer rounding. Initial stock stays fixed. New receipts cannot be forwarded: outbound transfers are limited to initial stock above the origin's full local scenario requirement.

Raw source bytes are verified during preparation and API startup. Each saved run includes the operational snapshot, parameters, input/scenario/source/SQL/engine fingerprints and runtime versions. Do not present the simulated objective difference as actual company savings.
