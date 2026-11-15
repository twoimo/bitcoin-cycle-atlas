// The published 0.6.22 root declaration uses `export * from './viz'`, which NodeNext
// cannot resolve to its existing dist/viz/index.d.ts. Re-export the upstream viz declarations
// by their exact installed file path; Vite/runtime imports remain the public package root.
declare module '@funnest/charts-react' {
  export {
    CartesianChart, XAxis, YAxis, Line, Area, BarPlot, CandlestickChart, CandlePlot,
    Scrubber, ReferenceLine, Point, Legend, PeriodSelector, LineChart, AreaChart, BarChart,
    PercentageBarChart, HorizontalBarChart, DonutChart, TreemapChart, LiveTabLabel,
    DEFAULT_PERIODS, useCartesianChart, formatNumber,
  } from '../../../node_modules/@funnest/charts-react/dist/viz/index.js';
  export type {
    CartesianChartProps, XAxisConfig, YAxisConfig, LegendConfig, Inset, XAxisProps,
    YAxisProps, LineProps, AreaProps, AreaFill, LinePoint, SplitColors, GradientStop,
    BarPlotProps, CandlestickChartProps, CandlePlotProps, Candle, ScrubberProps,
    ReferenceLineProps, PointProps, LegendProps, LegendItem, LegendPosition, LegendShape,
    PeriodSelectorProps, Period, LineChartProps, AreaChartProps, BarChartProps,
    PercentageBarChartProps, PercentageBarItem, PercentageBarRow,
    HorizontalBarChartProps, DonutChartProps, DonutItem, DonutCenter,
    TreemapChartProps, TreemapItem, ChartSeries, RangeValue, LineStyle,
    CartesianContextValue, PlotRect,
  } from '../../../node_modules/@funnest/charts-react/dist/viz/index.js';
}
