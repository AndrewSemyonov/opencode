import type { Component } from "solid-js"
import {
  AreaChart,
  BarChart,
  BubbleChart,
  Chart,
  DonutChart,
  GaugeChart,
  LineChart,
  PieChart,
  PolarAreaChart,
  RadarChart,
  ScatterChart,
  StackedBarChart,
} from "../charts"
import { Callout } from "./components/callout"
import { KPI, Stat } from "./components/kpi"
import { Grid, MdxCard } from "./components/layout"

export const mdxComponentRegistry: Record<string, Component<any>> = {
  Chart,
  LineChart,
  AreaChart,
  BarChart,
  StackedBarChart,
  PieChart,
  DonutChart,
  RadarChart,
  ScatterChart,
  BubbleChart,
  PolarAreaChart,
  GaugeChart,
  KPI,
  Stat,
  Callout,
  Grid,
  Card: MdxCard,
}

export function lookupMdxComponent(name: string | undefined | null): Component<any> | undefined {
  if (!name) return undefined
  return mdxComponentRegistry[name]
}
