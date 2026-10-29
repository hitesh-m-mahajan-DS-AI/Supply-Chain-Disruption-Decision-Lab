import { lazy, Suspense } from "react";
import type { EChartsOption } from "echarts";
const EChart = lazy(() => import("./EChart"));
export default function Chart(props: { option: EChartsOption; label: string }) {
  return (
    <Suspense
      fallback={<div className="chart empty-inline">Loading chart…</div>}
    >
      <EChart {...props} />
    </Suspense>
  );
}
