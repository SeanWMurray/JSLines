class JSLines {
  constructor(el, opts = {}) {
    this._el = el;
    this._opts = Object.assign({
      type: 'line',
      lineColor: '#2563eb',
      lineWidth: 2,
      fill: false,
      fillColor: 'rgba(37, 99, 235, 0.1)',
      axes: { show: false, color: '#e5e7eb' },
      hover: false,
      padding: 4,
    }, opts);

    if (opts.axes) {
      this._opts.axes = Object.assign({
        show: false,
        color: '#e5e7eb',
        labelColor: '#94a3b8',
        labelFont: '11px sans-serif',
        xLabels: null,   // string[] | Date[] parallel to data
        yTicks: 3,       // min, mid, max
        yFormat: null,   // (value: number) => string
        xFormat: null,   // (label: string|Date, index: number) => string
      }, opts.axes);
    } else {
      this._opts.axes = {
        show: false,
        color: '#e5e7eb',
        labelColor: '#94a3b8',
        labelFont: '11px sans-serif',
        xLabels: null,
        yTicks: 3,
        yFormat: null,
        xFormat: null,
      };
    }

    // Container must be positioned so overlays anchor correctly
    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.position = 'relative';

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'display:block;width:100%;height:100%;';
    el.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    this._dpr = window.devicePixelRatio || 1;

    // Reusable render state — no allocations inside render loop
    this._min = 0;
    this._max = 0;
    this._data = null;
    this._rawData = null;  // original data for hover labels
    this._w = 0;
    this._h = 0;
    this._pad = { top: 4, right: 4, bottom: 4, left: 4 };

    // Hover state
    this._hoverIdx = -1;
    this._tooltip = null;
    this._dot = null;
    this._labelOverlay = null;
    this._onMouseMove = null;
    this._onMouseLeave = null;

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(el);

    this._setSize();

    if (this._opts.hover) this._initHover();

    if (opts.data) this.update(opts.data);
  }

  // ─── Size ────────────────────────────────────────────────────────────────

  _setSize() {
    const rect = this._el.getBoundingClientRect();
    const dpr = this._dpr;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._ctx.scale(dpr, dpr);
    this._w = rect.width;
    this._h = rect.height;
    this._computePadding();
  }

  _resize() {
    this._setSize();
    this._render();
    if (this._opts.axes.show) this._renderLabels();
  }

  // ─── Padding (expands to make room for axis labels) ──────────────────────

  _computePadding() {
    const base = this._opts.padding;
    const axes = this._opts.axes;
    if (axes.show) {
      // Reserve space for Y labels on the left and X labels on the bottom
      this._pad.top = 8;
      this._pad.right = 8;
      this._pad.bottom = 22;
      this._pad.left = 52;
    } else {
      this._pad.top = base;
      this._pad.right = base;
      this._pad.bottom = base;
      this._pad.left = base;
    }
  }

  // ─── Data ────────────────────────────────────────────────────────────────

  _normalize(data) {
    if (!data || !data.length) return null;
    if (typeof data[0] === 'object') {
      const arr = new Float64Array(data.length);
      for (let i = 0; i < data.length; i++) arr[i] = data[i].y;
      return arr;
    }
    return data instanceof Float64Array ? data : new Float64Array(data);
  }

  _calcMinMax(arr) {
    let min = arr[0], max = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    if (min === max) { min -= 1; max += 1; }
    this._min = min;
    this._max = max;
  }

  // ─── Coordinate helpers (called in render — no allocations) ──────────────

  _xAt(i, len, aw) {
    return this._pad.left + (i / (len - 1)) * aw;
  }

  _yAt(val, ah) {
    return this._pad.top + ah - ((val - this._min) / (this._max - this._min)) * ah;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  _render() {
    const ctx = this._ctx;
    const data = this._data;
    const w = this._w;
    const h = this._h;
    const pad = this._pad;

    ctx.clearRect(0, 0, w, h);

    if (!data || data.length < 2) return;

    const aw = w - pad.left - pad.right;
    const ah = h - pad.top - pad.bottom;
    const len = data.length;

    if (this._opts.axes.show) this._drawAxes(ctx, w, h, pad, aw, ah, len);

    // Build line path in one loop
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = this._xAt(i, len, aw);
      const y = this._yAt(data[i], ah);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    if (this._opts.fill) {
      ctx.lineTo(pad.left + aw, pad.top + ah);
      ctx.lineTo(pad.left, pad.top + ah);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ah);
      grad.addColorStop(0, this._opts.fillColor);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Redraw line on top of fill
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = this._xAt(i, len, aw);
        const y = this._yAt(data[i], ah);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = this._opts.lineColor;
    ctx.lineWidth = this._opts.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Redraw hover dot if active
    if (this._hoverIdx >= 0) this._drawDot(this._hoverIdx, aw, ah);
  }

  _drawAxes(ctx, w, h, pad, aw, ah, len) {
    ctx.beginPath();
    ctx.strokeStyle = this._opts.axes.color;
    ctx.lineWidth = 1;
    // X baseline
    ctx.moveTo(pad.left, h - pad.bottom);
    ctx.lineTo(pad.left + aw, h - pad.bottom);
    // Y axis
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.stroke();

    // Tick marks on Y
    const ticks = this._opts.axes.yTicks || 3;
    ctx.beginPath();
    ctx.strokeStyle = this._opts.axes.color;
    ctx.lineWidth = 1;
    for (let t = 0; t < ticks; t++) {
      const frac = t / (ticks - 1);
      const y = pad.top + ah * (1 - frac);
      ctx.moveTo(pad.left - 4, y);
      ctx.lineTo(pad.left, y);
    }
    ctx.stroke();
  }

  // ─── DOM label overlay ───────────────────────────────────────────────────

  _renderLabels() {
    const axes = this._opts.axes;
    if (!axes.show || !this._data) return;

    if (!this._labelOverlay) {
      this._labelOverlay = document.createElement('div');
      this._labelOverlay.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
      this._el.appendChild(this._labelOverlay);
    }

    const ol = this._labelOverlay;
    ol.innerHTML = '';

    const pad = this._pad;
    const w = this._w;
    const h = this._h;
    const aw = w - pad.left - pad.right;
    const ah = h - pad.top - pad.bottom;
    const data = this._data;
    const len = data.length;
    const font = axes.labelFont || '11px sans-serif';
    const color = axes.labelColor || '#94a3b8';
    const ticks = axes.yTicks || 3;

    const mkSpan = (text, left, top, extra) => {
      const s = document.createElement('span');
      s.style.cssText =
        `position:absolute;font:${font};color:${color};white-space:nowrap;${extra || ''}`;
      s.style.left = left + 'px';
      s.style.top = top + 'px';
      s.textContent = text;
      ol.appendChild(s);
    };

    // Y labels
    const yFmt = axes.yFormat || (v => {
      return Math.abs(v) >= 1000
        ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : String(+v.toFixed(2));
    });

    for (let t = 0; t < ticks; t++) {
      const frac = t / (ticks - 1);
      const val = this._min + (this._max - this._min) * frac;
      const y = pad.top + ah * (1 - frac);
      mkSpan(yFmt(val), 0, y - 7, `width:${pad.left - 8}px;text-align:right;`);
    }

    // X labels — pick a sensible subset so they don't overlap
    const xLabels = axes.xLabels;
    if (xLabels && xLabels.length) {
      const xFmt = axes.xFormat || (lbl => {
        if (lbl instanceof Date) {
          return lbl.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        return String(lbl);
      });

      // Determine max labels that fit without overlap (assume ~50px per label)
      const maxLabels = Math.max(2, Math.floor(aw / 50));
      const step = Math.max(1, Math.ceil((len - 1) / (maxLabels - 1)));

      for (let i = 0; i < len; i += step) {
        const idx = Math.min(i, len - 1);
        const x = this._xAt(idx, len, aw);
        const text = xFmt(xLabels[idx], idx);
        mkSpan(text, x, h - pad.bottom + 4, 'transform:translateX(-50%);');
      }
      // Always include last point
      const lastX = this._xAt(len - 1, len, aw);
      const lastText = xFmt(xLabels[len - 1], len - 1);
      mkSpan(lastText, lastX, h - pad.bottom + 4, 'transform:translateX(-50%);');
    }
  }

  // ─── Hover ───────────────────────────────────────────────────────────────

  _initHover() {
    // Tooltip div — created once, reused
    this._tooltip = document.createElement('div');
    const hasCustomRenderer = typeof this._opts.renderTooltip === 'function';
    this._tooltip.style.cssText = hasCustomRenderer
      ? 'position:absolute;pointer-events:none;display:none;z-index:10;'
      : 'position:absolute;pointer-events:none;display:none;' +
        'background:#1e293b;color:#f8fafc;font:12px sans-serif;' +
        'padding:3px 7px;border-radius:4px;white-space:nowrap;z-index:10;';
    this._el.appendChild(this._tooltip);

    // Dot canvas overlay
    this._dot = document.createElement('canvas');
    this._dot.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this._el.appendChild(this._dot);
    this._dotCtx = this._dot.getContext('2d');

    this._onMouseMove = e => this._handleMove(e);
    this._onMouseLeave = () => this._handleLeave();
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  _syncDotCanvas() {
    this._dot.width = this._canvas.width;
    this._dot.height = this._canvas.height;
    this._dotCtx.scale(this._dpr, this._dpr);
  }

  _handleMove(e) {
    const data = this._data;
    if (!data || data.length < 2) return;

    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    const pad = this._pad;
    const aw = this._w - pad.left - pad.right;
    const len = data.length;

    // Find nearest index
    let nearest = 0, minDist = Infinity;
    for (let i = 0; i < len; i++) {
      const x = this._xAt(i, len, aw);
      const d = Math.abs(mx - x);
      if (d < minDist) { minDist = d; nearest = i; }
    }

    if (nearest === this._hoverIdx) return;
    this._hoverIdx = nearest;

    const ah = this._h - pad.top - pad.bottom;
    this._drawDot(nearest, aw, ah);
    this._showTooltip(nearest, aw, ah);
  }

  _handleLeave() {
    this._hoverIdx = -1;
    if (this._dot) {
      this._dotCtx.clearRect(0, 0, this._dot.width, this._dot.height);
    }
    if (this._tooltip) this._tooltip.style.display = 'none';
  }

  _drawDot(idx, aw, ah) {
    if (!this._dot) return;

    // Sync dot canvas size with main canvas if needed
    if (this._dot.width !== this._canvas.width || this._dot.height !== this._canvas.height) {
      this._syncDotCanvas();
    }

    const ctx = this._dotCtx;
    ctx.clearRect(0, 0, this._w, this._h);

    const x = this._xAt(idx, this._data.length, aw);
    const y = this._yAt(this._data[idx], ah);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 6.2832);
    ctx.fillStyle = this._opts.lineColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 6.2832);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _showTooltip(idx, aw, ah) {
    if (!this._tooltip) return;

    const data = this._data;
    const axes = this._opts.axes;
    const x = this._xAt(idx, data.length, aw);
    const y = this._yAt(data[idx], ah);

    const yFmt = axes.yFormat || (v =>
      Math.abs(v) >= 1000
        ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : String(+v.toFixed(2))
    );

    let label = yFmt(data[idx]);

    const xLabels = axes.xLabels;
    if (xLabels && xLabels[idx] != null) {
      const xFmt = axes.xFormat || (lbl => {
        if (lbl instanceof Date) {
          return lbl.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        return String(lbl);
      });
      label = xFmt(xLabels[idx], idx) + ': ' + label;
    }

    const tt = this._tooltip;
    const renderTooltip = this._opts.renderTooltip;
    if (renderTooltip) {
      const xLabel = (axes.xLabels && axes.xLabels[idx] != null) ? axes.xLabels[idx] : null;
      tt.innerHTML = renderTooltip(data[idx], xLabel, idx);
    } else {
      tt.textContent = label;
    }
    tt.style.display = 'block';

    // Position above the dot, clamped within container
    const tw = tt.offsetWidth;
    const th = tt.offsetHeight;
    let tx = x - tw / 2;
    let ty = y - th - 8;
    if (tx < 0) tx = 0;
    if (tx + tw > this._w) tx = this._w - tw;
    if (ty < 0) ty = y + 12;
    tt.style.left = tx + 'px';
    tt.style.top = ty + 'px';
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  update(newData) {
    this._rawData = newData;
    this._data = this._normalize(newData);
    if (this._data) this._calcMinMax(this._data);
    this._render();
    if (this._opts.axes.show) this._renderLabels();
  }

  destroy() {
    this._ro.disconnect();
    if (this._onMouseMove) {
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
      this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._canvas.remove();
    if (this._tooltip) this._tooltip.remove();
    if (this._dot) this._dot.remove();
    if (this._labelOverlay) this._labelOverlay.remove();
    this._data = null;
    this._ctx = null;
    this._canvas = null;
    this._tooltip = null;
    this._dot = null;
    this._dotCtx = null;
    this._labelOverlay = null;
    this._ro = null;
  }
}
