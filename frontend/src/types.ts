export type Parameters = {
  name: string;
  demand_pct: number;
  budget_gbp: number;
  disrupted_supplier: string;
  supplier_capacity_pct: number;
  extra_lead_days: number;
  allow_transfers: boolean;
  transfer_limit: number;
  minimum_service_pct: number;
};
export type Product = {
  sku: string;
  description: string;
  observed_units: number;
  priority: number;
  shortfall_penalty_pence: number;
};
export type Cell = {
  sku: string;
  hub: string;
  base_demand: number;
  initial_stock: number;
  demand: number;
  served: number;
  shortfall: number;
  ending_stock: number;
  purchased: number;
  transfer_in: number;
  transfer_out: number;
};
export type Offer = {
  supplier: string;
  sku: string;
  capacity: number;
  unit_cost_pence: number;
  lead_days: number;
};
export type Scenario = {
  version: string;
  seed: number;
  horizon_days: number;
  historical_window: string;
  source_sha256: string;
  products: Product[];
  inventory: Cell[];
  offers: Offer[];
  hubs: string[];
  receiving_capacity: Record<string, number>;
  transfer_unit_cost_pence: number;
  transfer_lead_days: number;
  provenance: string;
};
export type Metrics = {
  demand: number;
  served: number;
  shortfall: number;
  service_pct: number;
  purchase_cost_pence: number;
  transfer_cost_pence: number;
  action_cost_pence: number;
  shortfall_penalty_pence: number;
  objective_pence: number;
  transferred_units: number;
};
export type Action = {
  kind: string;
  sku: string;
  hub: string;
  units: number;
  supplier?: string;
  from_hub?: string;
  unit_cost_pence: number;
  arrival_days: number;
};
export type Check = {
  label: string;
  used: number;
  limit: number;
  slack: number;
  unit: string;
  minimum: boolean;
  ok: boolean;
  at_limit: boolean;
};
export type Audit = {
  valid: boolean;
  violations: string[];
  checks: Check[];
  note: string;
};
export type Plan = {
  method: string;
  status: string;
  seconds: number;
  metrics: Metrics | null;
  allocations: Cell[];
  decisions: Action[];
  audit: Audit | null;
  mip_gap: number | null;
  message?: string;
};
export type Run = {
  supply_bounds?: {
    sku: string;
    required: number;
    initial_stock: number;
    eligible_supplier_capacity: number;
    minimum_unmet_from_supply: number;
  }[];
  id: string;
  created_at: string;
  parameters: Parameters;
  scenario_snapshot: Scenario;
  scenario_sha256: string;
  source_sql: string;
  source_sql_sha256: string;
  runtime: Record<string, string>;
  budget_sensitivity: {
    budget_gbp: number;
    status: string;
    metrics: Metrics | null;
  }[];
  input_sha256: string;
  engine_sha256: string;
  engine_version: string;
  baseline: Plan;
  optimized: Plan;
  comparable: boolean;
  objective_reduction_pct: number | null;
  interpretation: string;
};
export type Catalog = {
  scenario: Scenario;
  presets: {
    id: string;
    title: string;
    description: string;
    parameters: Parameters;
  }[];
  sql: string;
  source: {
    title: string;
    url: string;
    license: string;
    raw_rows: number;
    selected_products: number;
  };
};
export type Saved = {
  id: string;
  created_at: string;
  name: string;
  status: string;
};
