# JSLines — AI Code Generation Specification

This document is the authoritative reference for generating JSLines integration code. Read it in full before writing any code. All defaults, types, constraints, and behaviors described here reflect the actual library implementation.

---

## Library identity

- **Class name:** `JSLines`
- **File:** `jslines.js`
- **No build step, no imports, no dependencies.** Include the script tag and the class is globally available.
- **Rendering engine:** HTML5 Canvas 2D (`CanvasRenderingContext2D`). Do not attempt to read or manipulate the canvas element directly — use the public API only.

```html
<script src="jslines.js"></script>
```

---

## Constructor

```js
const chart = new JSLines(element, options);
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `element` | `HTMLElement` | yes | The container element. JSLines creates a `<canvas>` inside it. The container must have explicit width and height (via CSS). JSLines sets `position: relative` on the container automatically if it is `static`. |
| `options` | `object` | no | Configuration object. All fields are optional. |

The constructor immediately captures the container's current size and renders if `options.data` is provided. A `ResizeObserver` is attached to the container and handles all future size changes automatically — do not manually resize the canvas.

---

## Options reference

All options are passed as a single flat object. Nested objects (`axes`) are described separately below.

### Top-level options

| Option | Type | Default | Description |
|---|---|---|---|
| `data` | `number[]` or `{x, y}[]` | `undefined` | The dataset to render. See Data formats. Can be omitted at construction and provided later via `chart.update()`. |
| `type` | `string` | `'line'` | Chart type. Only `'line'` is currently supported. |
| `lineColor` | `string` | `'#2563eb'` | Any valid CSS color string. Applied to the line stroke and the hover dot fill. |
| `lineWidth` | `number` | `2` | Stroke width in CSS pixels. |
| `fill` | `boolean` | `false` | When `true`, renders a vertical linear gradient from `fillColor` at the top of the line down to transparent at the baseline. |
| `fillColor` | `string` | `'rgba(37, 99, 235, 0.1)'` | The top color of the fill gradient. Should be semi-transparent. Has no effect when `fill` is `false`. |
| `hover` | `boolean` | `false` | When `true`, enables mousemove interaction. A dot snaps to the nearest data point and a tooltip appears above it. |
| `renderTooltip` | `function` | `null` | Custom tooltip renderer. See Hover and tooltip customization. |
| `padding` | `number` | `4` | Internal canvas padding in CSS pixels applied on all sides when axes are hidden. When `axes.show` is `true` this value is ignored — padding is computed automatically to fit labels. |
| `axes` | `object` | see below | Axis and label configuration. |

### `axes` options

Passed as `axes: { ... }` inside the options object. All fields are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | `false` | When `true`, draws an X baseline and Y axis line on the canvas, tick marks on the Y axis, and renders a DOM label overlay. |
| `color` | `string` | `'#e5e7eb'` | Color of the axis lines and tick marks drawn on the canvas. |
| `labelColor` | `string` | `'#94a3b8'` | Color of the text labels in the DOM overlay. |
| `labelFont` | `string` | `'11px sans-serif'` | CSS font shorthand applied to all axis labels. |
| `xLabels` | `string[]` or `Date[]` | `null` | An array of labels parallel to the data array (same length, same index). When provided, X-axis labels are rendered below the chart and hover tooltips include the label. Accepts raw strings or `Date` objects. |
| `yTicks` | `number` | `3` | Number of Y-axis labels to render. The default of `3` produces min, midpoint, and max labels. |
| `yFormat` | `function` | auto | `(value: number) => string`. Formats Y-axis tick labels and the value shown in the default hover tooltip. Default: values >= 1000 use `toLocaleString` with no decimal places; smaller values use `toFixed(2)`. |
| `xFormat` | `function` | auto | `(label: string \| Date, index: number) => string`. Formats X-axis tick labels and the X portion of the default hover tooltip. Default: `Date` objects are formatted as `"Mon DD"` (e.g. `"Jan 5"`); strings are passed through unchanged. |

---

## Data formats

JSLines accepts two input formats. Both produce identical output.

**Format A — flat number array (preferred)**

X positions are inferred as evenly spaced indices (0, 1, 2, ...).

```js
chart.update([1200, 1450, 1100, 1890, 1600, 1750]);
```

**Format B — array of `{x, y}` objects**

The `x` property is currently ignored for positioning (spacing is still even). Only `y` is used for rendering. Use `axes.xLabels` to supply meaningful X labels.

```js
chart.update([
  { x: 1, y: 1200 },
  { x: 2, y: 1450 },
  { x: 3, y: 1100 },
]);
```

**Constraints:**
- Minimum 2 data points required to render. Fewer than 2 points results in a cleared canvas with no output and no error.
- All-equal values are handled: the library adds `±1` to min/max to prevent division by zero, rendering a flat centered line.
- Data is normalized to `Float64Array` internally. The original array is not mutated.

---

## Public methods

### `chart.update(newData)`

Replaces the current dataset and re-renders. Does not recreate the canvas or reinitialize any state. Safe to call on every animation frame or in response to live data.

```js
chart.update([1300, 1500, 1050, 1700]);
```

### `chart.destroy()`

Disconnects the `ResizeObserver`, removes all event listeners, removes the canvas and all DOM overlays from the container, and nullifies all internal references. Call this when removing a chart from the DOM to prevent memory leaks.

```js
chart.destroy();
```

There is no `reinitialize` method. After `destroy()`, the instance is dead. Create a new `JSLines` instance if you need to re-render.

---

## Hover and tooltip customization

### Default behavior

When `hover: true`, moving the mouse over the chart snaps a dot to the nearest data point (by X distance) and shows a tooltip above it. The dot is drawn in `lineColor` with a white ring. The tooltip shows:

- The Y value formatted by `axes.yFormat` (or the default formatter)
- If `axes.xLabels` is provided: `"<xLabel>: <yValue>"`

The tooltip is positioned above the dot and clamped to stay within the container bounds. If there is not enough space above, it flips below.

### Custom tooltip via `renderTooltip`

When `renderTooltip` is provided, JSLines calls it on every hover and sets the result as `innerHTML` of the tooltip container. The tooltip container is created with no default visual styles (only `position: absolute`, `pointer-events: none`, `display: none`, `z-index: 10`) — all appearance is your responsibility.

```js
const chart = new JSLines(el, {
  data: values,
  hover: true,
  axes: { xLabels: labels },
  renderTooltip: (value, xLabel, index) => {
    return `<div class="tooltip">
      <div class="tooltip-label">${xLabel ?? ''}</div>
      <div class="tooltip-value">$${value.toFixed(2)}</div>
    </div>`;
  },
});
```

**Callback signature:**

| Argument | Type | Description |
|---|---|---|
| `value` | `number` | The raw Y value at the hovered data point. |
| `xLabel` | `string \| Date \| null` | The entry from `axes.xLabels` at the hovered index, or `null` if `xLabels` was not provided. |
| `index` | `number` | Zero-based index of the hovered point in the data array. |

**Return value:** An HTML string. It is injected via `innerHTML` directly into the tooltip element. Do not return a DOM node.

**Positioning:** JSLines still handles positioning — the tooltip is placed above the dot and clamped within the container. You control only the visual content and appearance, not the position.

**Security note:** If any part of your tooltip content comes from user-supplied data, sanitize it before injecting. JSLines does not sanitize `renderTooltip` output.

---

## Axes and label rendering

When `axes.show` is `true`:

- Two lines are drawn on the canvas: an X baseline at the bottom of the plot area and a Y axis on the left.
- Small tick marks (4px) are drawn on the Y axis at each tick position.
- A `position: absolute` DOM overlay is created inside the container and populated with `<span>` elements for Y labels (left of the axis) and X labels (below the baseline). This overlay has `pointer-events: none` and `overflow: hidden`.
- The canvas padding is automatically increased to `{ top: 8, right: 8, bottom: 22, left: 52 }` to reserve space for labels. The `padding` option is ignored when axes are shown.
- X labels are thinned automatically when they would overlap. The algorithm assumes approximately 50px per label and selects a step interval accordingly. The first and last labels are always shown.
- The label overlay is rebuilt on every `update()` and `_resize()` call. Do not cache references to label elements.

**Y label default formatting:**
```js
// values >= 1000
v.toLocaleString(undefined, { maximumFractionDigits: 0 })  // "1,200"

// values < 1000
String(+v.toFixed(2))  // "42.50"
```

**X label default formatting:**
```js
// Date objects
lbl.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })  // "Jan 5"

// strings
String(lbl)  // passed through unchanged
```

---

## Container requirements

- The container element must have an explicit width and height set via CSS before the chart is initialized. JSLines reads dimensions via `getBoundingClientRect()` at construction time. A container with zero dimensions results in a blank canvas.
- JSLines sets `position: relative` on the container if it is currently `position: static`. If the container already has `position: absolute`, `fixed`, or `sticky`, that is preserved.
- The `<canvas>` element is appended as a direct child of the container with `width: 100%; height: 100%; display: block`. Do not manually add other positioned children to the container unless you account for stacking context — JSLines appends its own overlays (dot canvas, label div, tooltip div) as siblings of the main canvas.
- Device pixel ratio (Retina / HiDPI) scaling is applied automatically. Do not set `canvas.width` or `canvas.height` manually.

---

## DOM structure produced

After initialization with `hover: true` and `axes.show: true`, the container's DOM looks like this:

```
<div id="your-container">           ← position: relative (set by JSLines if needed)
  <canvas>                          ← main chart canvas, 100% × 100%
  <div>                             ← label overlay, position: absolute, pointer-events: none
    <span>1,200</span>              ← Y label
    <span>Jan 5</span>              ← X label
    ...
  <canvas>                          ← dot overlay canvas, position: absolute
  <div>                             ← tooltip div, position: absolute
```

All of these are removed by `chart.destroy()`.

---

## Framework integration patterns

### Vanilla JS

```js
const el = document.getElementById('chart');
const chart = new JSLines(el, {
  data: [100, 150, 120, 180],
  hover: true,
});

// Update data later
chart.update(newData);

// Clean up
chart.destroy();
```

### React (useEffect)

```jsx
import { useEffect, useRef } from 'react';

function Sparkline({ data }) {
  const ref = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    chart.current = new JSLines(ref.current, { hover: true });
    return () => chart.current.destroy();
  }, []);

  useEffect(() => {
    if (chart.current) chart.current.update(data);
  }, [data]);

  return <div ref={ref} style={{ width: '100%', height: '60px' }} />;
}
```

### Vue (Composition API)

```js
import { onMounted, onUnmounted, watch, ref } from 'vue';

const el = ref(null);
let chart;

onMounted(() => {
  chart = new JSLines(el.value, { hover: true });
  chart.update(props.data);
});

watch(() => props.data, (newData) => {
  chart?.update(newData);
});

onUnmounted(() => {
  chart?.destroy();
});
```

---

## Common patterns and recipes

### Minimal sparkline (no axes, no hover)

```js
new JSLines(document.getElementById('el'), {
  data: [10, 40, 25, 60, 45, 70],
});
```

### Sparkline with fill

```js
new JSLines(el, {
  data: [10, 40, 25, 60, 45, 70],
  fill: true,
  fillColor: 'rgba(37, 99, 235, 0.1)',
  lineColor: '#2563eb',
});
```

### Chart with currency Y axis and date X axis

```js
const dates = data.map((_, i) => {
  const d = new Date(2024, 0, 1);
  d.setMonth(i);
  return d;
});

new JSLines(el, {
  data: data,
  axes: {
    show: true,
    xLabels: dates,
    yFormat: v => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
});
```

### Hover with a fully custom tooltip

```js
new JSLines(el, {
  data: values,
  hover: true,
  axes: { xLabels: labels },
  renderTooltip: (value, xLabel, index) => {
    const formatted = value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    return `<div style="background:#1e293b;color:#fff;padding:6px 10px;border-radius:5px;font:12px sans-serif">
      <div style="opacity:.7;font-size:10px">${xLabel ?? 'Point ' + index}</div>
      <div style="font-weight:600">${formatted}</div>
    </div>`;
  },
});
```

### Rendering many charts efficiently

```js
const containers = document.querySelectorAll('.sparkline');
const charts = [];

containers.forEach(el => {
  const data = JSON.parse(el.dataset.values);
  charts.push(new JSLines(el, { data, lineWidth: 1.5 }));
});

// Later, destroy all
charts.forEach(c => c.destroy());
```

### Live updating chart

```js
const chart = new JSLines(el, { data: initialData, hover: true });

setInterval(() => {
  chart.update(fetchLatestData());
}, 5000);
```

---

## What JSLines does not do

Do not attempt to generate code for the following — these features do not exist in the library:

- Multiple series / datasets on a single chart
- Bar, pie, scatter, or any chart type other than `line`
- Grid lines or horizontal reference lines
- Text labels directly on the canvas (all text is in the DOM overlay)
- Animations or transitions between data updates
- Click events or touch support
- Zoom or pan
- Legends
- Logarithmic or non-linear axis scaling
- Exporting to PNG or SVG

---

## Error conditions and edge cases

| Situation | Behavior |
|---|---|
| Fewer than 2 data points | Canvas is cleared, nothing is drawn, no error thrown |
| All values identical | Min is decreased by 1, max increased by 1; line renders flat and centered |
| Container has zero width or height at init | Canvas has zero dimensions; ResizeObserver will trigger a redraw when the container gains size |
| `data` not provided at construction | Chart waits silently; call `chart.update(data)` when ready |
| `renderTooltip` returns empty string | Tooltip element is shown but empty; positioning still runs |
| `axes.xLabels` length does not match data length | Labels are accessed by index; missing labels silently produce `null` as the xLabel argument in `renderTooltip` |
| `destroy()` called twice | Second call will throw because internal references are null; guard with a flag if needed |
