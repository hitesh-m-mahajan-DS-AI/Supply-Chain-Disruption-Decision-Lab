import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  FileCheck2,
  FlaskConical,
  GitCompareArrows,
  History,
  LayoutDashboard,
  LoaderCircle,
  Package,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Waypoints,
  X,
} from "lucide-react";
import Chart from "./Chart";
import type { Catalog, Parameters, Plan, Run, Saved, Scenario } from "./types";

const pages = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "scenario", label: "Design scenario", icon: SlidersHorizontal },
  { id: "results", label: "Compare plans", icon: GitCompareArrows },
  { id: "evidence", label: "Data & evidence", icon: Database },
  { id: "history", label: "Saved runs", icon: History },
  { id: "method", label: "Method & model", icon: FlaskConical },
];
const count = (n: number) => n.toLocaleString("en-GB");
const money = (p: number) =>
  (p / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  });
const date = (s: string) =>
  new Date(s).toLocaleString("en-GB", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
const defaultPage = () =>
  pages.some((p) => p.id === location.hash.slice(1))
    ? location.hash.slice(1)
    : "overview";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const error = await response.json();
      if (typeof error.detail === "string") message = error.detail;
      else if (Array.isArray(error.detail))
        message = error.detail
          .map(
            (e: { loc: string[]; msg: string }) =>
              `${e.loc.slice(1).join(".")}: ${e.msg}`,
          )
          .join(" · ");
    } catch {
      /* Preserve the HTTP status when no JSON body is available. */
    }
    throw new Error(message);
  }
  return response.json();
}

function Tag({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Boxes size={38} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(defaultPage);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<Parameters | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [planChoice, setPlanChoice] = useState<"optimized" | "baseline">(
    "optimized",
  );
  const [resultTab, setResultTab] = useState("allocation");
  const [evidenceTab, setEvidenceTab] = useState("sources");

  useEffect(() => {
    Promise.all([api<Catalog>("/catalog"), api<Saved[]>("/runs")])
      .then(([data, saved]) => {
        setCatalog(data);
        setDraft({ ...data.presets[0].parameters });
        setHistory(saved);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const changed = () => {
      if (pages.some((p) => p.id === location.hash.slice(1)))
        setPage(location.hash.slice(1));
    };
    addEventListener("hashchange", changed);
    return () => removeEventListener("hashchange", changed);
  }, []);
  function go(id: string) {
    location.hash = id;
    setPage(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function update<K extends keyof Parameters>(key: K, value: Parameters[K]) {
    setDraft((old) => (old ? { ...old, [key]: value } : old));
  }
  function preset(index: number) {
    if (catalog) {
      setDraft({ ...catalog.presets[index].parameters });
      setError("");
      go("scenario");
    }
  }
  async function calculate(parameters: Parameters) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Run>("/runs", parameters);
      setRun(result);
      setDraft({ ...result.parameters });
      setPlanChoice("optimized");
      setResultTab("allocation");
      setHistory(await api<Saved[]>("/runs"));
      go("results");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Calculation failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openRun(id: string) {
    setBusy(true);
    setError("");
    try {
      const saved = await api<Run>(`/runs/${id}`);
      setRun(saved);
      setDraft({ ...saved.parameters });
      setPlanChoice("optimized");
      go("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this run.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        <p>Opening the decision lab…</p>
      </div>
    );
  if (!catalog || !draft)
    return (
      <div className="boot">
        <CircleAlert />
        <h1>The local API is unavailable</h1>
        <p>{error}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  const scenario = run?.scenario_snapshot ?? catalog.scenario;
  const dirty =
    !!run && JSON.stringify(draft) !== JSON.stringify(run.parameters);
  const activePage = pages.find((p) => p.id === page)!;
  const plan = run?.[planChoice];
  const optimized = run?.optimized;
  const baseline = run?.baseline;
  const stockTotal = catalog.scenario.inventory.reduce(
    (n, r) => n + r.initial_stock,
    0,
  );
  const demandTotal = catalog.scenario.products.reduce(
    (n, r) => n + r.observed_units,
    0,
  );
  const runButton = (
    <button
      className="primary"
      disabled={busy}
      onClick={() => calculate(draft)}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{" "}
      {busy ? "Calculating…" : "Run comparison"}
    </button>
  );

  function exports() {
    if (!run) return null;
    return (
      <div className="exports">
        <span>Export this saved run</span>
        {["md", "csv", "json"].map((kind) => (
          <a
            className="quiet-button"
            href={`/api/runs/${run.id}/export/${kind}`}
            key={kind}
          >
            <ArrowDownToLine size={14} />
            {kind === "md" ? "Decision brief" : kind.toUpperCase()}
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="shell">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Waypoints size={24} />
          </div>
          <div>
            SUPPLY CHAIN<span>Decision Lab</span>
          </div>
        </div>
        <div className="workspace-label">F1 / OPERATIONS RESEARCH</div>
        <nav aria-label="Main navigation">
          {pages.map(({ id, label, icon: Icon }, i) => (
            <button
              key={id}
              className={page === id ? "nav-item active" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {i < 3 && <small>0{i + 1}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={19} />
          <strong>Local. Reproducible.</strong>
          <p>
            Six products. Three hubs.
            <br />
            Every assumption visible.
          </p>
          <span className="sidebar-dot" /> No paid services
        </div>
        <div className="profile">
          <span className="avatar">HM</span>
          <div>
            Hitesh M. Mahajan<small>Portfolio / Supply chain analytics</small>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} /> <span>{activePage.label}</span>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <i />
              Local API connected
            </span>
            <span className="vertical-line" />
            <span>MODEL v1.0</span>
          </div>
        </header>
        <main id="content">
          {error && (
            <div className="notice danger" role="alert">
              <CircleAlert size={18} />
              <div>
                <strong>We couldn’t complete that request.</strong>
                <p>{error}</p>
              </div>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {dirty && (
            <div className="notice amber" role="status">
              <CircleAlert size={18} />
              <div>
                Scenario inputs have changed. Results and exports still describe
                saved run <code>{run!.id.slice(0, 8)}</code>.
              </div>
              <button
                className="text-button"
                onClick={() => setDraft({ ...run!.parameters })}
              >
                Restore run inputs
              </button>
            </div>
          )}

          {page === "overview" && (
            <>
              <div className="eyebrow">DECISIONS UNDER CONSTRAINTS</div>
              <div className="page-heading">
                <div>
                  <h1>Plan through disruption.</h1>
                  <p>
                    A supplier goes offline. Find a feasible response,
                    understand the trade-offs,
                    <br className="desktop-break" /> and take the evidence with
                    you.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => calculate(catalog.presets[0].parameters)}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Play size={17} />
                  )}
                  Run supplier-outage demo
                </button>
              </div>
              <div className="scope-strip">
                <FlaskConical size={17} />
                <span>
                  <strong>Planning simulation.</strong> Public historical sale
                  counts; fictional stock, supplier terms and costs. No
                  real-world savings claim.
                </span>
                <button className="text-button" onClick={() => go("evidence")}>
                  View provenance <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="metrics-grid overview-metrics">
                <Metric
                  label="ILLUSTRATIVE REQUIREMENTS"
                  value={count(demandTotal)}
                  detail="Units from a historical 7-day window"
                  icon={<Package />}
                />
                <Metric
                  label="FICTIONAL STARTING STOCK"
                  value={count(stockTotal)}
                  detail="Seed-42 allocation across three hubs"
                  icon={<Boxes />}
                />
                <Metric
                  label="SUPPLIER OPTIONS"
                  value="03"
                  detail="Capacity, cost and arrival constraints"
                  icon={<Truck />}
                />
                <Metric
                  label="PLANNING HORIZON"
                  value="7 days"
                  detail="Fulfilment assessed at the deadline"
                  icon={<Clock3 />}
                />
              </div>
              <div className="overview-grid">
                <section className="panel network-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">THE STARTING POSITION</span>
                      <h2>One network. Uneven stock.</h2>
                    </div>
                    <Tag tone="neutral">Synthetic operations</Tag>
                  </div>
                  <p className="muted">
                    Initial stock and illustrative requirements, aggregated
                    across the six products.
                  </p>
                  <div className="hub-grid">
                    {catalog.scenario.hubs.map((hub) => {
                      const rows = catalog.scenario.inventory.filter(
                        (r) => r.hub === hub,
                      );
                      const stock = rows.reduce(
                          (n, r) => n + r.initial_stock,
                          0,
                        ),
                        need = rows.reduce((n, r) => n + r.base_demand, 0);
                      return (
                        <div className="hub-card" key={hub}>
                          <div className="hub-icon">
                            <Boxes size={24} />
                          </div>
                          <h3>{hub} hub</h3>
                          <span className="hub-value">
                            {count(stock)}
                            <small>starting units</small>
                          </span>
                          <div className="coverage-track">
                            <span
                              style={{
                                width: `${Math.min((stock / need) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <div className="hub-caption">
                            {count(need)} required{" "}
                            <span>
                              {((stock / need) * 100).toFixed(0)}% covered
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="panel-footer">
                    <Waypoints size={16} />
                    <span>
                      Transfers can use initial surplus only. Receiving and
                      shared action budgets still apply.
                    </span>
                  </div>
                </section>
                <section className="panel journey">
                  <span className="eyebrow">YOUR WORKFLOW</span>
                  <h2>
                    From disruption
                    <br />
                    to a defensible plan.
                  </h2>
                  {[
                    [
                      "01",
                      "Set the scenario",
                      "Choose a disruption and define your operating constraints.",
                    ],
                    [
                      "02",
                      "Compare responses",
                      "Inspect the heuristic baseline and optimized allocation.",
                    ],
                    [
                      "03",
                      "Review the evidence",
                      "Check conservation, limits and reproducible snapshots.",
                    ],
                  ].map(([n, title, text]) => (
                    <div className="journey-step" key={n}>
                      <span>{n}</span>
                      <div>
                        <strong>{title}</strong>
                        <p>{text}</p>
                      </div>
                    </div>
                  ))}
                  <button className="secondary" onClick={() => go("scenario")}>
                    Design a scenario <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">START WITH A QUESTION</span>
                  <h2>Five scenarios, different trade-offs.</h2>
                </div>
                <span className="muted">Ready to explore / fully editable</span>
              </div>
              <div className="preset-grid">
                {catalog.presets.map((preset, i) => (
                  <button
                    className="preset-card"
                    key={preset.id}
                    disabled={busy}
                    onClick={() => {
                      setDraft({ ...preset.parameters });
                      go("scenario");
                    }}
                  >
                    <span className={`preset-index index-${i}`}>0{i + 1}</span>
                    <h3>{preset.title}</h3>
                    <p>{preset.description}</p>
                    <span className="preset-open">
                      Open scenario <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {page === "scenario" && (
            <>
              <div className="eyebrow">01 / DESIGN SCENARIO</div>
              <div className="page-heading">
                <div>
                  <h1>Define the operating reality.</h1>
                  <p>
                    Change an assumption. Compare both methods under the same
                    constraints.
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDraft({ ...catalog.presets[0].parameters })}
                >
                  <RotateCcw size={16} />
                  Reset to outage demo
                </button>
              </div>
              <div className="scenario-layout">
                <form
                  className="panel scenario-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    calculate(draft);
                  }}
                >
                  <fieldset disabled={busy}>
                    <div className="panel-heading">
                      <h2>Scenario controls</h2>
                      <Tag tone="neutral">Fictional assumptions</Tag>
                    </div>
                    <label className="field">
                      Scenario name
                      <input
                        required
                        maxLength={80}
                        value={draft.name}
                        onChange={(e) => update("name", e.target.value)}
                      />
                    </label>
                    <div className="form-section">
                      <h3>
                        <Truck size={17} />
                        Supply availability
                      </h3>
                      <div className="field-row">
                        <label className="field">
                          Unavailable supplier
                          <select
                            value={draft.disrupted_supplier}
                            onChange={(e) =>
                              update("disrupted_supplier", e.target.value)
                            }
                          >
                            {["None", "Atlas", "Beacon", "Cobalt", "All"].map(
                              (s) => (
                                <option key={s}>{s}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="field">
                          Extra supplier lead time
                          <span className="input-unit">
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={1}
                              value={draft.extra_lead_days}
                              onChange={(e) =>
                                update(
                                  "extra_lead_days",
                                  Number(e.target.value),
                                )
                              }
                            />
                            <span>days</span>
                          </span>
                        </label>
                      </div>
                      <Range
                        label="Available supplier capacity"
                        value={draft.supplier_capacity_pct}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(v) => update("supplier_capacity_pct", v)}
                      />
                      <p className="field-note">
                        Applied to every available offer. Arrivals after day 7
                        are excluded.
                      </p>
                    </div>
                    <div className="form-section">
                      <h3>
                        <Settings2 size={17} />
                        Demand & budget
                      </h3>
                      <Range
                        label="Requirement multiplier"
                        value={draft.demand_pct}
                        min={50}
                        max={180}
                        suffix="%"
                        onChange={(v) => update("demand_pct", v)}
                      />
                      <div className="field-row">
                        <label className="field">
                          Shared action budget
                          <span className="input-unit">
                            <span>£</span>
                            <input
                              type="number"
                              min={0}
                              max={30000}
                              step={1}
                              required
                              value={draft.budget_gbp}
                              onChange={(e) =>
                                update("budget_gbp", Number(e.target.value))
                              }
                            />
                          </span>
                        </label>
                        <label className="field">
                          Minimum fulfilment
                          <span className="input-unit">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              required
                              value={draft.minimum_service_pct}
                              onChange={(e) =>
                                update(
                                  "minimum_service_pct",
                                  Number(e.target.value),
                                )
                              }
                            />
                            <span>%</span>
                          </span>
                        </label>
                      </div>
                      <p className="field-note">
                        The budget covers purchases and transfers. A hard
                        service target can make the model infeasible.
                      </p>
                    </div>
                    <div className="form-section">
                      <h3>
                        <Waypoints size={17} />
                        Stock transfers
                      </h3>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={draft.allow_transfers}
                          onChange={(e) =>
                            update("allow_transfers", e.target.checked)
                          }
                        />
                        <span>Allow transfers of initial surplus stock</span>
                      </label>
                      <label className="field">
                        Maximum transferred units
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          step={1}
                          disabled={!draft.allow_transfers}
                          value={draft.transfer_limit}
                          onChange={(e) =>
                            update("transfer_limit", Number(e.target.value))
                          }
                        />
                      </label>
                      <p className="field-note">
                        35p per unit, arriving within 2 days. No forwarding of
                        new receipts.
                      </p>
                    </div>
                    <div className="form-action">
                      <span>
                        <ShieldCheck size={15} />
                        All inputs saved with the result
                      </span>
                      <button className="primary" type="submit">
                        {busy ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Play size={16} />
                        )}{" "}
                        {busy ? "Calculating…" : "Run comparison"}
                      </button>
                    </div>
                  </fieldset>
                </form>
                <aside className="scenario-aside">
                  <section className="panel">
                    <span className="eyebrow">THIS SCENARIO</span>
                    <h2>{draft.name || "Untitled scenario"}</h2>
                    <div className="summary-row">
                      <span>Requirement units</span>
                      <strong>
                        {count(
                          catalog.scenario.inventory.reduce(
                            (n, r) =>
                              n +
                              Math.ceil(
                                (r.base_demand * draft.demand_pct) / 100,
                              ),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                    <div className="summary-row">
                      <span>Starting stock</span>
                      <strong>{count(stockTotal)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Action budget</span>
                      <strong>{money(draft.budget_gbp * 100)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Unavailable supplier</span>
                      <strong>{draft.disrupted_supplier}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Service floor</span>
                      <strong>{draft.minimum_service_pct}%</strong>
                    </div>
                    <div className="small-note">
                      <CircleAlert size={16} />
                      <p>
                        Service is measured at the end of day 7. This model does
                        not track daily stockouts.
                      </p>
                    </div>
                  </section>
                  <section className="dark-panel">
                    <FileCheck2 size={24} />
                    <h3>What are we optimizing?</h3>
                    <p>
                      Purchase costs + transfer costs + assumed penalties for
                      unmet units.
                    </p>
                    <p>
                      Priority weights are explicit assumptions. A lower model
                      objective does not establish real company savings.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => go("method")}
                    >
                      Read the model <ArrowRight size={15} />
                    </button>
                  </section>
                  <section className="panel compact">
                    <h3>Switch scenario</h3>
                    {catalog.presets.map((p, i) => (
                      <button
                        className="list-link"
                        key={p.id}
                        disabled={busy}
                        onClick={() => preset(i)}
                      >
                        {p.title}
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </section>
                </aside>
              </div>
            </>
          )}

          {page === "results" &&
            (!run ? (
              <Empty
                title="Your comparison starts here."
                text="Run a scenario to compare allocations, spending and unmet requirements."
                action={runButton}
              />
            ) : (
              <>
                <div className="eyebrow">02 / COMPARE PLANS</div>
                <div className="page-heading">
                  <div>
                    <h1>{run.parameters.name}</h1>
                    <p>
                      <span className="mono">{run.id.slice(0, 8)}</span> ·{" "}
                      {date(run.created_at)} UTC ·{" "}
                      {count(run.baseline.metrics!.demand)} required units
                    </p>
                  </div>
                  {runButton}
                </div>
                <div
                  className={`result-banner ${optimized!.metrics ? "" : "warning"}`}
                >
                  <div>
                    {optimized!.metrics ? (
                      <CheckCheck size={22} />
                    ) : (
                      <CircleAlert size={22} />
                    )}
                    <div>
                      {!baseline!.audit?.valid && (
                        <p>
                          <strong>Baseline fails a required constraint.</strong>
                        </p>
                      )}
                      <strong>
                        {optimized!.status === "optimal"
                          ? "Optimal for the stated assumptions"
                          : optimized!.status === "infeasible"
                            ? "These constraints have no feasible solution"
                            : optimized!.status ===
                                "feasible_not_proven_optimal"
                              ? "Feasible plan; optimality not proven"
                              : "No optimizer plan available"}
                      </strong>
                      <p>
                        {run.comparable && run.objective_reduction_pct !== null
                          ? `${run.objective_reduction_pct.toFixed(2)}% lower simulated objective than the baseline. Review spending and service separately.`
                          : optimized!.metrics
                            ? "The baseline does not satisfy every constraint, so an objective improvement is not reported."
                            : "Try lowering the service floor, restoring capacity, or increasing the action budget."}
                      </p>
                    </div>
                  </div>
                  <Tag tone={optimized!.metrics ? "green" : "amber"}>
                    {optimized!.metrics
                      ? `${optimized!.seconds.toFixed(3)}s solver time`
                      : "Infeasible / not solved"}
                  </Tag>
                </div>
                <div className="metrics-grid">
                  {[
                    ["UNMET REQUIREMENTS", "shortfall", false],
                    ["FULFILMENT", "service_pct", false],
                    ["ACTION SPENDING", "action_cost_pence", true],
                    ["MODEL OBJECTIVE", "objective_pence", true],
                  ].map(([label, key, isMoney]) => {
                    const k = key as keyof NonNullable<Plan["metrics"]>;
                    const format = (v: number) =>
                      isMoney
                        ? money(v)
                        : key === "service_pct"
                          ? `${v.toFixed(2)}%`
                          : count(v);
                    return (
                      <Metric
                        key={String(key)}
                        label={String(label)}
                        value={
                          optimized!.metrics
                            ? format(optimized!.metrics[k])
                            : "Unavailable"
                        }
                        detail={`Baseline: ${format(baseline!.metrics![k])}`}
                        icon={
                          key === "shortfall" ? (
                            <Package />
                          ) : key === "service_pct" ? (
                            <CheckCheck />
                          ) : key === "action_cost_pence" ? (
                            <Truck />
                          ) : (
                            <FlaskConical />
                          )
                        }
                      />
                    );
                  })}
                </div>
                {optimized!.metrics &&
                  (run.supply_bounds ?? []).some(
                    (row) => row.minimum_unmet_from_supply > 0,
                  ) && (
                    <div className="scope-strip">
                      <CircleAlert size={17} />
                      <span>
                        <strong>Physical supply limit.</strong>{" "}
                        {(run.supply_bounds ?? [])
                          .filter((row) => row.minimum_unmet_from_supply > 0)
                          .map(
                            (row) =>
                              `SKU ${row.sku}: ${count(row.initial_stock)} starting units + ${count(row.eligible_supplier_capacity)} eligible supplier units < ${count(row.required)} required. At least ${count(row.minimum_unmet_from_supply)} units must remain unmet.`,
                          )
                          .join(" ")}{" "}
                        More budget alone cannot remove this supply deficit.
                        Other constraints may add further shortfall.
                      </span>
                    </div>
                  )}
                {optimized!.metrics && (
                  <div className="charts-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Understand the cost trade-off</h2>
                          <p className="muted">
                            GBP / assumed penalties are not cash spending
                          </p>
                        </div>
                      </div>
                      <Chart
                        label="Baseline and optimizer action spending and assumed shortfall penalty in GBP"
                        option={{
                          color: ["#12756c", "#dda64a"],
                          tooltip: { trigger: "axis" },
                          legend: { bottom: 0 },
                          grid: { left: 70, right: 22, top: 25, bottom: 65 },
                          xAxis: {
                            type: "category",
                            data: ["Baseline", "Optimizer"],
                          },
                          yAxis: { type: "value", name: "GBP" },
                          series: [
                            {
                              name: "Action spending",
                              type: "bar",
                              stack: "cost",
                              barMaxWidth: 70,
                              data: [
                                baseline!.metrics!.action_cost_pence / 100,
                                optimized!.metrics.action_cost_pence / 100,
                              ],
                            },
                            {
                              name: "Assumed shortfall penalty",
                              type: "bar",
                              stack: "cost",
                              data: [
                                baseline!.metrics!.shortfall_penalty_pence /
                                  100,
                                optimized!.metrics.shortfall_penalty_pence /
                                  100,
                              ],
                            },
                          ],
                        }}
                      />
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Where do requirements remain unmet?</h2>
                          <p className="muted">
                            Units / end of the seven-day horizon
                          </p>
                        </div>
                      </div>
                      <Chart
                        label="Unmet units by warehouse for baseline and optimizer"
                        option={{
                          color: ["#b9c6c4", "#12756c"],
                          tooltip: { trigger: "axis" },
                          legend: { bottom: 0 },
                          grid: { left: 50, right: 20, top: 25, bottom: 65 },
                          xAxis: { type: "category", data: scenario.hubs },
                          yAxis: { type: "value", name: "Units" },
                          series: [
                            {
                              name: "Baseline",
                              type: "bar",
                              barMaxWidth: 40,
                              data: scenario.hubs.map((h) =>
                                baseline!.allocations
                                  .filter((a) => a.hub === h)
                                  .reduce((n, a) => n + a.shortfall, 0),
                              ),
                            },
                            {
                              name: "Optimizer",
                              type: "bar",
                              data: scenario.hubs.map((h) =>
                                optimized!.allocations
                                  .filter((a) => a.hub === h)
                                  .reduce((n, a) => n + a.shortfall, 0),
                              ),
                            },
                          ],
                        }}
                      />
                    </section>
                  </div>
                )}
                <section className="panel results-table">
                  <div className="panel-heading">
                    <div>
                      <h2>Inspect the plan</h2>
                      <p className="muted">
                        Every quantity traces back to a saved input snapshot.
                      </p>
                    </div>
                    <div className="segmented" aria-label="Choose plan">
                      {(["optimized", "baseline"] as const).map((choice) => (
                        <button
                          key={choice}
                          className={planChoice === choice ? "selected" : ""}
                          onClick={() => setPlanChoice(choice)}
                        >
                          {choice === "optimized" ? "Optimizer" : "Baseline"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="tabs">
                    {[
                      ["allocation", "Allocation"],
                      ["actions", "Action plan"],
                      ["checks", "Constraint checks"],
                      ["sensitivity", "Budget sensitivity"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={resultTab === id ? "selected" : ""}
                        onClick={() => setResultTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {!plan?.metrics ? (
                    <Empty
                      title="No optimizer allocation available"
                      text="The failed scenario is saved for inspection. The baseline remains available, with its constraint checks."
                    />
                  ) : (
                    <>
                      <div className="audit-line">
                        <Tag tone={plan.audit?.valid ? "green" : "amber"}>
                          {plan.audit?.valid ? (
                            <>
                              <Check size={13} />
                              Independent audit passed
                            </>
                          ) : (
                            "Plan fails a required constraint"
                          )}
                        </Tag>
                        <span className="muted">
                          {plan.audit?.checks.length} limit checks + stock and
                          demand reconciliation
                        </span>
                      </div>
                      {resultTab === "allocation" && (
                        <Table>
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Hub</th>
                              <th>Required</th>
                              <th>Start stock</th>
                              <th>Served</th>
                              <th>Unmet</th>
                              <th>Ending stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.allocations.map((row) => (
                              <tr key={row.sku + row.hub}>
                                <td className="mono">{row.sku}</td>
                                <td>{row.hub}</td>
                                <td>{count(row.demand)}</td>
                                <td>{count(row.initial_stock)}</td>
                                <td>{count(row.served)}</td>
                                <td>
                                  <span
                                    className={
                                      row.shortfall ? "number-warning" : ""
                                    }
                                  >
                                    {count(row.shortfall)}
                                  </span>
                                </td>
                                <td>{count(row.ending_stock)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                      {resultTab === "actions" &&
                        (plan.decisions.length ? (
                          <Table>
                            <thead>
                              <tr>
                                <th>Action</th>
                                <th>Product</th>
                                <th>Origin</th>
                                <th>Destination</th>
                                <th>Units</th>
                                <th>Unit cost</th>
                                <th>Arrival</th>
                              </tr>
                            </thead>
                            <tbody>
                              {plan.decisions.map((row, i) => (
                                <tr key={i}>
                                  <td>
                                    <Tag
                                      tone={
                                        row.kind === "transfer"
                                          ? "neutral"
                                          : "green"
                                      }
                                    >
                                      {row.kind}
                                    </Tag>
                                  </td>
                                  <td className="mono">{row.sku}</td>
                                  <td>{row.supplier ?? row.from_hub}</td>
                                  <td>{row.hub}</td>
                                  <td>{count(row.units)}</td>
                                  <td>{money(row.unit_cost_pence)}</td>
                                  <td>Day {row.arrival_days}</td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        ) : (
                          <p className="empty-inline">
                            No purchase or transfer actions in this plan.
                          </p>
                        ))}
                      {resultTab === "sensitivity" && (
                        <>
                          <p className="inset-note">
                            Actual counterfactual solves: only the shared action
                            budget changes. The objective minimizes spending
                            plus assumed penalties, not service alone.
                          </p>
                          <Table>
                            <thead>
                              <tr>
                                <th>Action budget</th>
                                <th>Solver status</th>
                                <th>Served units</th>
                                <th>Unmet units</th>
                                <th>Action spending</th>
                                <th>Model objective</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.budget_sensitivity.map((row) => (
                                <tr key={row.budget_gbp}>
                                  <td>
                                    {money(row.budget_gbp * 100)}{" "}
                                    {row.budget_gbp ===
                                      run.parameters.budget_gbp && (
                                      <Tag tone="neutral">This run</Tag>
                                    )}
                                  </td>
                                  <td>{row.status.replaceAll("_", " ")}</td>
                                  <td>
                                    {row.metrics
                                      ? count(row.metrics.served)
                                      : "Unavailable"}
                                  </td>
                                  <td>
                                    {row.metrics
                                      ? count(row.metrics.shortfall)
                                      : "Unavailable"}
                                  </td>
                                  <td>
                                    {row.metrics
                                      ? money(row.metrics.action_cost_pence)
                                      : "Unavailable"}
                                  </td>
                                  <td>
                                    {row.metrics
                                      ? money(row.metrics.objective_pence)
                                      : "Unavailable"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </>
                      )}
                      {resultTab === "checks" && (
                        <>
                          <p className="inset-note">
                            A limit reached is not proof of a causal bottleneck.
                            Zero-capacity offers also have zero slack.
                          </p>
                          {plan.audit!.violations.length > 0 && (
                            <div className="notice amber">
                              {plan.audit!.violations.join(" ")}
                            </div>
                          )}
                          <Table>
                            <thead>
                              <tr>
                                <th>Constraint</th>
                                <th>Used / served</th>
                                <th>{"Limit / minimum"}</th>
                                <th>Slack</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {plan.audit!.checks.map((check, i) => (
                                <tr key={i}>
                                  <td>{check.label}</td>
                                  <td>
                                    {check.unit === "pence"
                                      ? money(check.used)
                                      : count(check.used)}
                                  </td>
                                  <td>
                                    {check.minimum ? "≥ " : "≤ "}
                                    {check.unit === "pence"
                                      ? money(check.limit)
                                      : count(check.limit)}
                                  </td>
                                  <td>
                                    {check.unit === "pence"
                                      ? money(check.slack)
                                      : count(check.slack)}
                                  </td>
                                  <td>
                                    <Tag
                                      tone={
                                        !check.ok
                                          ? "amber"
                                          : check.at_limit
                                            ? "neutral"
                                            : "green"
                                      }
                                    >
                                      {!check.ok
                                        ? "Failed"
                                        : check.at_limit
                                          ? "At limit"
                                          : "Within limit"}
                                    </Tag>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </>
                      )}
                    </>
                  )}
                </section>
                <div className="scope-strip">
                  <FlaskConical size={17} />
                  <span>{run.interpretation}</span>
                </div>
                {exports()}
              </>
            ))}

          {page === "evidence" && (
            <>
              <div className="eyebrow">TRACEABILITY / DATA & EVIDENCE</div>
              <div className="page-heading">
                <div>
                  <h1>Inspect what the result rests on.</h1>
                  <p>
                    Public observations, fictional assumptions, and checks you
                    can follow.
                  </p>
                </div>
                <Tag tone="neutral">
                  {run
                    ? `Saved snapshot ${run.id.slice(0, 8)}`
                    : "Current dataset"}
                </Tag>
              </div>
              <div className="tabs standalone">
                {[
                  ["sources", "Sources & assumptions"],
                  ["sql", "Demand SQL"],
                  ["fingerprint", "Run fingerprint"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={evidenceTab === id ? "selected" : ""}
                    onClick={() => setEvidenceTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {evidenceTab === "sources" && (
                <>
                  <div className="evidence-grid">
                    <section className="panel">
                      <span className="eyebrow">OBSERVED / PUBLIC DATA</span>
                      <h2>UCI Online Retail</h2>
                      <p>
                        First 50,000 source rows, unchanged in a compressed
                        bundle. Six selected SKUs use positive, priced, non-C
                        sale lines from <strong>1–7 December 2010</strong>,
                        after exact-repeat quarantine.
                      </p>
                      <p>
                        These are historical observations used as an
                        illustrative requirement profile. No forecast, supplier
                        reliability or stock level is inferred.
                      </p>
                      <a
                        className="text-link"
                        href={catalog.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open original source <ArrowUpRight size={15} />
                      </a>
                      <p className="field-note">
                        Chen, D. (2015). Online Retail. CC BY 4.0.
                      </p>
                    </section>
                    <section className="panel">
                      <span className="eyebrow">ASSUMED / SEED 42</span>
                      <h2>A fictional operating network</h2>
                      <p>
                        Warehouse demand shares, starting stock, priorities,
                        supplier capacities, prices, receiving limits and lead
                        times are generated or specified for this simulation.
                      </p>
                      <p>
                        Historical SKU descriptions and unit counts are the only
                        observed product inputs. Priorities and penalties are
                        decision assumptions, not learned risk scores.
                      </p>
                      <Tag tone="amber">Synthetic operational assumptions</Tag>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Product input dictionary</h2>
                      <span className="muted">
                        Observed counts / assumed priorities and penalties
                      </span>
                    </div>
                    <Table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Original description</th>
                          <th>Observed units</th>
                          <th>Assumed priority</th>
                          <th>Penalty per unmet unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenario.products.map((p) => (
                          <tr key={p.sku}>
                            <td className="mono">{p.sku}</td>
                            <td>{p.description}</td>
                            <td>{count(p.observed_units)}</td>
                            <td>P{p.priority}</td>
                            <td>{money(p.shortfall_penalty_pence)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Fictional supplier offers</h2>
                      <span className="muted">
                        Before disruption / scenario adjustments
                      </span>
                    </div>
                    <Table>
                      <thead>
                        <tr>
                          <th>Supplier</th>
                          <th>SKU</th>
                          <th>Base capacity</th>
                          <th>Unit cost</th>
                          <th>Base lead time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenario.offers.map((o) => (
                          <tr key={o.supplier + o.sku}>
                            <td>{o.supplier}</td>
                            <td className="mono">{o.sku}</td>
                            <td>{count(o.capacity)}</td>
                            <td>{money(o.unit_cost_pence)}</td>
                            <td>{o.lead_days} days</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </section>
                </>
              )}
              {evidenceTab === "sql" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>The demand transformation</h2>
                      <p className="muted">
                        Executed by DuckDB during deterministic preparation. No
                        user-supplied SQL is executed.
                      </p>
                    </div>
                    <Tag tone="neutral">data/demand.sql</Tag>
                  </div>
                  <pre className="code-block">
                    {run?.source_sql ?? catalog.sql}
                  </pre>
                </section>
              )}
              {evidenceTab === "fingerprint" &&
                (run ? (
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Reproduce this exact comparison</h2>
                      <Tag>{run.engine_version}</Tag>
                    </div>
                    {[
                      ["Run ID", run.id],
                      ["Created UTC", run.created_at],
                      ["Input SHA-256", run.input_sha256],
                      ["Scenario SHA-256", run.scenario_sha256],
                      ["Engine SHA-256", run.engine_sha256],
                      ["SQL SHA-256", run.source_sql_sha256],
                      ["Public source SHA-256", scenario.source_sha256],
                    ].map(([label, value]) => (
                      <div className="fingerprint" key={label}>
                        <span>{label}</span>
                        <code>{value}</code>
                      </div>
                    ))}
                    <pre className="code-block">
                      {JSON.stringify(run.parameters, null, 2)}
                    </pre>
                    <p className="muted">
                      The JSON export includes every operational input and both
                      plans. Solver/library versions can affect tie-breaking; an
                      optimal solution need not be unique.
                    </p>
                    {exports()}
                  </section>
                ) : (
                  <Empty
                    title="No saved run yet"
                    text="Run a comparison to capture inputs, both plans, method version and reproducibility fingerprints."
                    action={runButton}
                  />
                ))}
            </>
          )}

          {page === "history" && (
            <>
              <div className="eyebrow">HISTORY / SAVED RUNS</div>
              <div className="page-heading">
                <div>
                  <h1>Every decision has a record.</h1>
                  <p>
                    Comparisons save automatically on this computer, including
                    infeasible scenarios.
                  </p>
                </div>
                <button className="secondary" onClick={() => go("scenario")}>
                  New scenario <ArrowRight size={16} />
                </button>
              </div>
              {history.length ? (
                <section className="panel">
                  <Table>
                    <thead>
                      <tr>
                        <th>Scenario</th>
                        <th>Created / UTC</th>
                        <th>Solver status</th>
                        <th>Run ID</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((saved) => (
                        <tr key={saved.id}>
                          <td>
                            <strong>{saved.name}</strong>
                          </td>
                          <td>{date(saved.created_at)}</td>
                          <td>
                            <Tag
                              tone={
                                saved.status === "optimal" ? "green" : "amber"
                              }
                            >
                              {saved.status.replaceAll("_", " ")}
                            </Tag>
                          </td>
                          <td className="mono">{saved.id.slice(0, 8)}</td>
                          <td>
                            <button
                              className="text-button"
                              disabled={busy}
                              aria-label={`Open ${saved.name}`}
                              onClick={() => openRun(saved.id)}
                            >
                              Open run <ArrowUpRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <p className="inset-note">
                    Showing the latest 100 local runs. The DuckDB history file
                    stays outside Git.
                  </p>
                </section>
              ) : (
                <Empty
                  title="A clean slate."
                  text="Run a comparison to save the full input snapshot and its independently checked results."
                  action={runButton}
                />
              )}
            </>
          )}

          {page === "method" && (
            <>
              <div className="eyebrow">MODEL CARD / v1.0</div>
              <div className="page-heading">
                <div>
                  <h1>Simple enough to explain.</h1>
                  <p>
                    Explicit decisions, explicit constraints, and an independent
                    audit.
                  </p>
                </div>
                <a
                  className="secondary"
                  href="/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open API contract <ArrowUpRight size={16} />
                </a>
              </div>
              <div className="method-grid">
                <section className="panel">
                  <Tag tone="neutral">Comparator</Tag>
                  <h2>The greedy baseline</h2>
                  <ol>
                    <li>Serve each hub from its own starting stock.</li>
                    <li>
                      Transfer initial surplus in SKU and hub order, within the
                      shared budget and limits.
                    </li>
                    <li>
                      Buy remaining requirements in SKU/hub order from the
                      cheapest available offer.
                    </li>
                    <li>
                      Check all physical constraints and the service floor
                      independently.
                    </li>
                  </ol>
                  <p>
                    The heuristic does not anticipate which action has the
                    largest system-wide value. If it misses a hard service
                    floor, it is labelled invalid and no objective-improvement
                    percentage is reported.
                  </p>
                </section>
                <section className="panel">
                  <Tag>Optimization</Tag>
                  <h2>The constrained model</h2>
                  <p>
                    SciPy / HiGHS mixed-integer linear optimization. Every
                    quantity is a nonnegative integer.
                  </p>
                  <div className="formula">
                    minimize
                    <br />
                    <strong>
                      purchases + transfers +<br />
                      assumed shortfall penalties
                    </strong>
                  </div>
                  <p>
                    Subject to shared budget, per-supplier/SKU capacity, arrival
                    eligibility, receiving capacity, initial-surplus transfer
                    limits, stock conservation and the optional service floor.
                  </p>
                  <p>
                    Five-second solver limit. A feasible incumbent is not
                    labelled optimal unless optimality is proven.
                  </p>
                </section>
              </div>
              <section className="panel">
                <h2>Model boundaries</h2>
                <div className="boundary-grid">
                  {[
                    [
                      "One deadline",
                      "This is an end-of-day-7 allocation. Intermediate daily demand, arrival sequencing and daily stockouts are not modelled.",
                    ],
                    [
                      "No invented forecasts",
                      "Historical sale counts supply an illustrative requirement pattern. Multipliers and warehouse splits are assumed.",
                    ],
                    [
                      "No forwarding receipts",
                      "Only starting stock above local requirements can be transferred. Purchases and inbound transfers cannot become transfer supply.",
                    ],
                    [
                      "No economic savings claim",
                      "Shortfall penalties and supplier costs are synthetic. A lower objective is only better under the chosen model assumptions.",
                    ],
                    [
                      "Independent checks",
                      "The audit reconstructs balances, costs and limits from the action rows instead of reusing the optimizer matrix.",
                    ],
                    [
                      "Local scope",
                      "No real orders are placed. One API process serves the built interface and stores local run snapshots. No paid service is required.",
                    ],
                  ].map(([title, text]) => (
                    <div key={title}>
                      <ShieldCheck size={18} />
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>Architecture in one line</h2>
                <div className="architecture">
                  <span>React + TypeScript</span>
                  <ArrowRight size={18} />
                  <span>FastAPI contract</span>
                  <ArrowRight size={18} />
                  <span>HiGHS + independent audit</span>
                  <ArrowRight size={18} />
                  <span>DuckDB run history</span>
                </div>
                <p className="muted">
                  Vite bundles the interface. Python owns all business
                  calculations. The browser displays server results; it does not
                  invent the comparison metrics.
                </p>
              </section>
            </>
          )}
          <footer className="footer">
            <span>
              Hitesh Milind Mahajan / Supply Chain Disruption Decision Lab
            </span>
            <span>
              Local simulation · Source attribution in Data & evidence
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </small>
    </label>
  );
}
