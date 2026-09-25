/* ==========================================================================
   PZ.charts — gráficos livianos en HTML/CSS (sin librerías)
   ========================================================================== */
(function (PZ) {
  const U = PZ.util;
  PZ.charts = {
    /** Barras verticales. data = [{label, value}] */
    bars(data, { money = true } = {}) {
      const max = Math.max(1, ...data.map((d) => d.value));
      return `<div class="bars">${data.map((d, i) => `
        <div class="bar"><i style="height:${(d.value / max) * 100}%;animation-delay:${i * 0.03}s" data-v="${money ? U.money(d.value) : d.value}"></i><span>${U.esc(d.label)}</span></div>`).join('')}</div>`;
    },

    /** Barras horizontales (ranking). */
    hbars(data, { money = false, suffix = '' } = {}) {
      if (!data.length) return '<div class="empty small">Sin datos todavía</div>';
      const max = Math.max(1, ...data.map((d) => d.value));
      return `<div class="hbars">${data.map((d, i) => `
        <div class="hb"><span class="hb-name" title="${U.esc(d.label)}">${U.esc(d.label)}</span>
          <div class="hb-track"><div class="hb-fill" style="width:${(d.value / max) * 100}%;animation-delay:${i * 0.05}s"></div></div>
          <span class="hb-val">${money ? U.money(d.value) : U.num(d.value) + suffix}</span></div>`).join('')}</div>`;
    },

    /** Torta tipo dona. data = [{label, value, color}] */
    donut(data, { money = true } = {}) {
      const total = data.reduce((a, d) => a + d.value, 0);
      if (!total) return '<div class="empty small">Sin datos todavía</div>';
      let acc = 0;
      const stops = data.map((d) => {
        const from = (acc / total) * 360;
        acc += d.value;
        return `${d.color} ${from}deg ${(acc / total) * 360}deg`;
      }).join(',');
      return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div>
        <div class="legend-list">${data.map((d) => `<div><i style="background:${d.color}"></i>${U.esc(d.label)} · ${money ? U.money(d.value) : d.value} <span class="muted">(${Math.round((d.value / total) * 100)}%)</span></div>`).join('')}</div></div>`;
    },

    methodColors: { efectivo: '#2d6a4f', transferencia: '#1d7bd7', qr: '#00a3e0', tarjeta: '#8e44ad' },
  };
})(window.PZ);
