"use client";
import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  init,
  use,
  type EChartsCoreOption,
  type EChartsType,
} from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AriaComponent,
  GraphicComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type {
  StatisticsDimension,
  StatisticsMetric,
  StatisticsQuarter,
} from "@/types";
import {
  groupColor,
  pieStatistics,
  quarterLabel,
  trendSeries,
} from "@/lib/statistics";

use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  AriaComponent,
  GraphicComponent,
  SVGRenderer,
]);

export default function StatisticsChart({
  kind,
  quarters,
  metric,
  names,
  dimension,
}: {
  kind: "line" | "bar" | "pie";
  quarters: StatisticsQuarter[];
  metric: StatisticsMetric;
  names: string[];
  dimension: StatisticsDimension;
}) {
  const element = useRef<HTMLDivElement>(null),
    chart = useRef<EChartsType>();
  const { resolvedTheme } = useTheme();
  const height = kind === "bar" ? Math.max(320, names.length * 29 + 65) : 380;
  const option = useMemo<EChartsCoreOption>(() => {
    const dark = resolvedTheme === "dark";
    const fg = dark ? "#eceef3" : "#161921",
      muted = dark ? "#a4abba" : "#61697b",
      line = dark ? "#303644" : "#e4e7ed";
    const base: EChartsCoreOption = {
      animation: false,
      textStyle: {
        color: fg,
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      },
      aria: { enabled: true, decal: { show: kind === "pie" } },
      tooltip: {
        trigger: "axis",
        renderMode: "richText",
        confine: true,
        backgroundColor: dark ? "#20242d" : "#fff",
        borderColor: line,
        textStyle: { color: fg, fontSize: 12 },
      },
    };
    const scoreKey = metric === "average" ? "average_score" : "max_score";
    const score = (n: number | null | undefined) =>
      n == null ? "暂无评分" : `${n.toFixed(2)} 分`;
    if (kind === "line") {
      return {
        ...base,
        grid: {
          left: 38,
          right: 16,
          top: 22,
          bottom: quarters.length > 8 ? 82 : 54,
        },
        xAxis: {
          type: "category",
          data: quarters.map((q) =>
            quarterLabel(q.year, q.season).replace(" ", "\n"),
          ),
          boundaryGap: false,
          axisLine: { lineStyle: { color: line } },
          axisLabel: { color: muted, lineHeight: 17, hideOverlap: true },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 10,
          interval: 2,
          axisLabel: { color: muted, formatter: "{value} 分" },
          splitLine: { lineStyle: { color: line, type: "dashed" } },
        },
        dataZoom:
          quarters.length > 8
            ? [
                {
                  type: "slider",
                  height: 18,
                  bottom: 9,
                  borderColor: line,
                  textStyle: { color: muted },
                  filterMode: "none",
                },
              ]
            : [],
        tooltip: {
          ...(base.tooltip as object),
          formatter: (params: unknown) => {
            const points = params as {
              dataIndex: number;
              seriesName: string;
              value: number | null;
            }[];
            const q = quarters[points[0]?.dataIndex];
            if (!q) return "";
            const visible = points.filter((p) => p.value != null);
            return [
              quarterLabel(q.year, q.season),
              ...visible.slice(0, 8).map((p) => {
                const g = q.groups.find((g) => g.name === p.seriesName);
                return `${p.seriesName}  ${score(p.value)}  · ${g?.rated_count ?? 0}/${g?.count ?? 0} 部有评分\n    ${(g?.vote_count ?? 0).toLocaleString()} 评分人次`;
              }),
              ...(visible.length > 8
                ? [`另有 ${visible.length - 8} 组，见下方明细`]
                : []),
              ...(!visible.length ? ["本季所选分组暂无评分"] : []),
            ].join("\n");
          },
        },
        series: trendSeries(quarters, names, metric).map((s, i) => ({
          ...s,
          type: "line",
          connectNulls: false,
          smooth: false,
          showSymbol: quarters.length < 32,
          symbol: ["circle", "rect", "triangle", "diamond"][i % 4],
          symbolSize: 6,
          lineStyle: { width: 2, type: ["solid", "dashed", "dotted"][i % 3] },
          itemStyle: { color: groupColor(s.name) },
          emphasis: { focus: "series" },
        })),
      };
    }
    const q = quarters[0];
    if (kind === "bar") {
      const groups = names.map((name) =>
        q.groups.find((g) => g.name === name)!,
      );
      return {
        ...base,
        grid: { left: 66, right: 48, top: 12, bottom: 32 },
        xAxis: {
          type: "value",
          min: 0,
          max: 10,
          axisLabel: { color: muted },
          splitLine: { lineStyle: { color: line, type: "dashed" } },
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: names,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: fg, fontSize: 12 },
        },
        tooltip: {
          ...(base.tooltip as object),
          formatter: (params: unknown) => {
            const p = (params as { dataIndex: number }[])[0],
              g = groups[p?.dataIndex];
            return g
              ? `${g.name}\n${score(g[scoreKey])}\n${g.rated_count}/${g.count} 部作品有评分\n${g.vote_count.toLocaleString()} 评分人次`
              : "";
          },
        },
        series: [
          {
            type: "bar",
            barMaxWidth: 16,
            data: groups.map((g) => ({
              value: g[scoreKey],
              itemStyle: {
                color: groupColor(g.name),
                borderRadius: [0, 4, 4, 0],
              },
            })),
            label: {
              show: true,
              position: "right",
              color: muted,
              formatter: (p: { value: unknown }) =>
                typeof p.value === "number" ? p.value.toFixed(2) : "",
            },
          },
        ],
      };
    }
    const data = pieStatistics(q);
    return {
      ...base,
      legend: {
        type: "scroll",
        bottom: 2,
        left: "center",
        selectedMode: false,
        textStyle: { color: muted },
        pageTextStyle: { color: muted },
        pageIconColor: muted,
        data: data.map((d) => d.name),
      },
      tooltip: {
        ...(base.tooltip as object),
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number };
          return `${p.name}\n涉及 ${p.value} 部 · ${((p.value / q.distribution_total) * 100).toFixed(1)}%\n共 ${q.distribution_total.toLocaleString()} ${dimension === "genre" ? "次类型计数" : "部作品"}`;
        },
      },
      graphic: [
        {
          type: "text",
          left: "center",
          top: "40%",
          style: {
            text: q.total_count.toLocaleString(),
            fill: fg,
            fontSize: 28,
            fontWeight: 600,
            align: "center",
          },
        },
        {
          type: "text",
          left: "center",
          top: "49%",
          style: {
            text: "去重作品",
            fill: muted,
            fontSize: 12,
            align: "center",
          },
        },
      ],
      series: [
        {
          type: "pie",
          radius: ["47%", "69%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          label: {
            show: true,
            color: muted,
            fontSize: 11,
            formatter: (params: unknown) => {
              const p = params as { name: string; percent: number };
              return p.percent >= 5 ? `${p.name}\n${p.percent}%` : "";
            },
          },
          labelLine: { length: 10, length2: 8, lineStyle: { color: line } },
          data: data.map((d) => ({
            ...d,
            itemStyle: {
              color: groupColor(d.name),
              borderColor: dark ? "#181b22" : "#fff",
              borderWidth: 2,
            },
          })),
        },
      ],
    };
  }, [kind, quarters, metric, names, resolvedTheme, dimension]);
  useEffect(() => {
    if (!element.current) return;
    const instance = init(element.current, undefined, { renderer: "svg" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = undefined;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);
  return (
    <div
      ref={element}
      style={{ height }}
      className="w-full min-w-0"
      role="img"
      aria-label={`${kind === "line" ? "季度评分趋势折线图" : kind === "bar" ? "季度评分柱状图" : "季度数量占比饼图"}，完整数据见明细表`}
    />
  );
}
