// @ts-check
/**
 * The parts of Apache ECharts used by <vt-chart>, bundled on their own (dist/vendor/
 * echarts.js) and loaded only when a page shows a chart.
 *
 * @module vendor/echarts
 */
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { UniversalTransition, LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  UniversalTransition,
  LabelLayout,
  CanvasRenderer,
]);

export { echarts };
