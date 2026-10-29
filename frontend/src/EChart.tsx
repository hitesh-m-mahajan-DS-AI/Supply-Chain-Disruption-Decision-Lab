import { useEffect, useRef } from "react";
import { init, use } from "echarts/core";
import type { EChartsOption } from "echarts";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

use([BarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

export default function Chart({
  option,
  label,
}: {
  option: EChartsOption;
  label: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const chart = init(element.current, undefined, { renderer: "svg" });
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);
  return <div ref={element} className="chart" role="img" aria-label={label} />;
}
