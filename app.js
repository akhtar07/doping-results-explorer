/* Gate-Doping Results Explorer: renders data/results.json with Plotly. */
"use strict";

let D = null;                       // the full dataset
const renderers = [];               // re-run on theme change / tab show
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, html = "") => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (html) el.innerHTML = html;
  return el;
};

/* ------------------------------------------------------------ formatting */
function chem(s) {
  if (!s) return "";
  let t = s.replace("_bare", " (bare)").replace("-W", "/W")
    .replace(/_?OH2$/, "(OH)2").replace(/_(O2|F2|Cl2)$/, "$1");
  return t.replace(/([A-Za-z)])(\d+)/g, "$1<sub>$2</sub>");
}
const plain = s => chem(s).replace(/<\/?sub>/g, "");
const f = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x)) ? "–" : Number(x).toFixed(d);
const sgn = (x, d = 3) => (x > 0 ? "+" : "") + f(x, d);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function dirClass(m) {
  if (!m.h) return null;
  const e = m.e.total, hh = m.h.total;
  if (e < 0 && hh > 0) return "canonical";
  if (e > 0 && hh < 0) return "anti";
  return "same";
}
const DIR_LABEL = { canonical: "softens (e⁻), hardens (h⁺)", anti: "hardens (e⁻), softens (h⁺)", same: "same direction for both" };

/* ------------------------------------------------------------ plotting */
function baseLayout(extra = {}) {
  const ink = css("--ink-2"), line = css("--line");
  const ax = { gridcolor: line, zerolinecolor: css("--muted"), linecolor: line, tickfont: { color: ink }, title: { font: { color: ink } }, automargin: true };
  const L = {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 12, color: ink },
    margin: { l: 56, r: 16, t: 28, b: 48 }, hoverlabel: { font: { family: "IBM Plex Sans" } },
    legend: { orientation: "h", y: 1.12, x: 0, font: { color: ink } },
    xaxis: { ...ax }, yaxis: { ...ax },
  };
  for (const [k, v] of Object.entries(extra)) {
    L[k] = (k.startsWith("xaxis") || k.startsWith("yaxis")) ? { ...ax, ...v, title: { font: { color: ink }, ...(typeof v.title === "string" ? { text: v.title } : v.title || {}) } } : v;
  }
  return L;
}
function plot(el, traces, layout) {
  if (!window.Plotly) return;
  Plotly.react(el, traces, baseLayout(layout), { responsive: true, displaylogo: false, displayModeBar: window.innerWidth > 600 ? "hover" : false, modeBarButtonsToRemove: ["lasso2d", "select2d"] });
}
function reg(fn) { renderers.push(fn); fn(); }

/* ------------------------------------------------------------ widgets */
function seg(options, value, onChange) {
  const w = h("div", { class: "seg", role: "group" });
  options.forEach(([v, label]) => {
    const b = h("button", { type: "button" }, label);
    if (v === value) b.classList.add("on");
    b.onclick = () => { [...w.children].forEach(c => c.classList.remove("on")); b.classList.add("on"); onChange(v); };
    w.append(b);
  });
  return w;
}
function select(options, value, onChange, label) {
  const l = h("label", {}, label ? `${label} ` : "");
  const s = h("select");
  options.forEach(([v, t]) => { const o = h("option", { value: v }); o.textContent = t; if (v === value) o.selected = true; s.append(o); });
  s.onchange = () => onChange(s.value);
  l.append(s);
  return l;
}
function block(parent, title, desc) {
  const b = h("div", { class: "block" });
  const head = h("div", { class: "block-head" });
  const t = h("div", {}, `<h3>${title}</h3>${desc ? `<p class="desc">${desc}</p>` : ""}`);
  const c = h("div", { class: "controls" });
  head.append(t, c);
  b.append(head);
  parent.append(b);
  return { b, controls: c };
}
function plotDiv(parent, cls = "plot") { const d = h("div", { class: cls }); parent.append(d); return d; }

/* sortable table: cols = [{k, t, fmt, cls}] */
function table(parent, cols, rows) {
  const wrap = h("div", { class: "tbl-wrap" });
  const t = h("table");
  const thead = h("thead"), tr = h("tr");
  let sortK = null, asc = true;
  cols.forEach(c => {
    const th = h("th", { class: c.l ? "l" : "" }, c.t);
    th.onclick = () => {
      asc = sortK === c.k ? !asc : true; sortK = c.k;
      [...tr.children].forEach(x => x.classList.remove("sorted", "asc"));
      th.classList.add("sorted"); if (asc) th.classList.add("asc");
      fill();
    };
    tr.append(th);
  });
  thead.append(tr);
  const tb = h("tbody");
  t.append(thead, tb); wrap.append(t); parent.append(wrap);
  let data = rows;
  function fill() {
    let r = [...data];
    if (sortK) {
      const c = cols.find(c => c.k === sortK);
      const key = c.sort || (x => x[c.k]);
      r.sort((a, b) => { const A = key(a), B = key(b); return (A > B ? 1 : A < B ? -1 : 0) * (asc ? 1 : -1); });
    }
    tb.innerHTML = r.map(row => "<tr>" + cols.map(c => {
      const v = c.get ? c.get(row) : row[c.k];
      const cl = [c.l ? "l" : "", c.cls ? c.cls(row) : ""].join(" ");
      return `<td class="${cl}">${c.fmt ? c.fmt(v, row) : v}</td>`;
    }).join("") + "</tr>").join("");
  }
  fill();
  return { update(rws) { data = rws; fill(); } };
}

/* ------------------------------------------------------------ tabs */
function showTab(id) {
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === id));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === id));
  try { history.replaceState(null, "", "#" + id); } catch (e) { /* ignore */ }
  window.scrollTo({ top: 0 });
  // Plotly needs a resize once a hidden panel becomes visible
  requestAnimationFrame(() => document.querySelectorAll(`#${id} .js-plotly-plot`).forEach(p => Plotly.Plots.resize(p)));
}

/* ------------------------------------------------------------ lightbox */
function openLightbox(src, cap) {
  const lb = $("#lightbox");
  $("img", lb).src = src; $("img", lb).alt = cap; $(".cap", lb).textContent = cap;
  lb.hidden = false;
}
const FIGCAP = {
  fig0_schematic: "Decomposition protocol: band filling, structural relaxation and cross term",
  fig1_bond_rule: "Bonding rule: ΔICOHP of every bond under electron and hole doping",
  fig2_icohp_decomposition: "ICOHP response split into band-filling and structural channels",
  fig3_spectra: "Undoped Γ-point optical spectra",
  fig4_mode_decomposition: "Mode shifts split into channels",
  fig5_mode_sign: "Mode-sign tests against the bonding prediction",
  fig6_lattice: "Lattice-constant response",
  fig7_alpha_beta: "Odd (linear) and even (quadratic) parts of the response",
  fig8_dk_dicohp: "Bond stiffness vs bond strength under doping",
  figS_displacement_m2c: "Eigenvector displacements, bare M₂C",
  figS_displacement_m2ct: "Eigenvector displacements, terminated M₂CTₓ",
  figS_displacement_mxene: "Eigenvector displacements, Ti₃C₂Tₓ",
  figS_doping_series: "Fine doping series ±0.3 e/f.u.",
  figS_freqladder_m2c: "Frequency ladders, bare M₂C",
  figS_freqladder_m2ct: "Frequency ladders, terminated M₂CTₓ",
  figS_freqladder_mxene: "Frequency ladders, Ti₃C₂Tₓ",
  figS_pcohp_m2c: "Energy-resolved M–M COHP of bare M₂C",
  figS_spillout: "Jellium spill-out of the doping charge",
  figS_vacuum_phonons: "Vacuum-width dependence of phonons",
  figS_vacuum_scaling: "Vacuum-width scaling of the lattice response",
  fig1_lattice_bonds: "Lattice and metal–chalcogen bond response",
  fig2_mode_channels: "Mode shifts by channel",
  fig3_sign_test: "Sign tests of the bonding prediction",
  fig4_odd_even: "Odd/even decomposition",
  fig5_dk_dicohp: "Pair stiffness vs bond strength",
  fig1_series: "Interlayer ICOHP across the series",
  fig2_jellium: "Vacuum test of jellium-sensitive observables",
  fig3_breathing: "Layer-breathing force constant and frequency vs doping",
  fig4_bond_vs_mode: "Interlayer bond vs breathing mode",
};
function gallery(parent, paper) {
  const g = h("div", { class: "gallery" });
  (D.figs[paper] || []).forEach(n => {
    const key = n.replace(".png", ""), cap = FIGCAP[key] || key;
    const fig = h("figure", { class: "thumb" });
    const img = h("img", { src: `figs/${paper}/${n}`, alt: cap, loading: "lazy" });
    fig.append(img, h("figcaption", {}, `<span class="mono">${key}</span><br>${cap}`));
    fig.onclick = () => openLightbox(img.src, cap);
    g.append(fig);
  });
  parent.append(g);
}

/* ============================================================ OVERVIEW */
function renderOverview() {
  const root = $("#overview");
  const A = D.paper1a, B = D.paper1b, C = D.paper2;
  const ml = A.bonds.filter(b => b.kind === "M-X"), mm = A.bonds.filter(b => b.kind === "M-M");
  const mlOK = ml.filter(b => b.follows).length, mmOK = mm.filter(b => b.follows).length;
  const bOK = B.bonds.filter(b => b.follows).length;
  const bi = A.bootstrap.bond_informed_all, sig = B.significance.all.sign_test;
  const p2 = p2Summary();
  const nShifts = A.modes.reduce((s, m) => s + 1 + (m.h ? 1 : 0), 0) + B.modes.reduce((s, m) => s + 1 + (m.h ? 1 : 0), 0);

  root.innerHTML = `
    <h1>Does a stronger bond mean a stiffer lattice?</h1>
    <p class="lede">Gate-induced phonon shifts in two-dimensional materials are usually explained with a bonding argument:
    added electrons fill antibonding states, bonds weaken, and modes soften. These three first-principles studies test
    each step of that argument for ${A.systems.length} carbide and MXene monolayers, ${B.systems.length} transition-metal
    dichalcogenide monolayers and ${C.pairs.length} van der Waals heterobilayers. The bonding rule holds for bonds, but it does not
    predict how the phonons shift.</p>
    <div class="cards">
      <div class="card"><div class="big">${A.systems.length + B.systems.length + C.pairs.length}</div><div class="lab">materials, each doped with electrons and with holes</div></div>
      <div class="card good"><div class="big">${mlOK + bOK}/${ml.length + B.bonds.length}</div><div class="lab">metal–ligand bonds weaken under electrons and strengthen under holes</div></div>
      <div class="card bad"><div class="big">${f(bi.rate_pct, 1)}% · ${f(100 * sig.k / sig.n, 1)}%</div><div class="lab">phonon shifts whose sign the bond predicts correctly (1a · 1b). Chance would give 50%.</div></div>
      <div class="card bad"><div class="big">${p2.opp}/${p2.n}</div><div class="lab">heterobilayers where hole doping strengthens the interlayer bond but softens the breathing mode</div></div>
    </div>`;
  const b1 = block(root, "The bonding rule against the phonon prediction",
    `Green bars show the share of bonds that obey the rule. Red bars show the share of mode shifts whose sign the bonding argument gets right. The dashed line marks chance (50%) for the sign prediction. In total ${nShifts} DFPT mode shifts were tested.`);
  const pd = plotDiv(b1.b);
  reg(() => {
    const cats = ["1a metal–ligand bonds", "1b metal–chalcogen bonds", "1a metal–metal bonds",
      "1a bond-informed mode sign", "1b bond-informed mode sign", "2 breathing mode vs bond (h⁺)"];
    const vals = [100 * mlOK / ml.length, 100 * bOK / B.bonds.length, 100 * mmOK / mm.length,
      bi.rate_pct, 100 * sig.k / sig.n, 100 * (p2.n - p2.opp) / p2.n];
    const txt = [`${mlOK}/${ml.length}`, `${bOK}/${B.bonds.length}`, `${mmOK}/${mm.length}`,
      `${bi.k}/${bi.n}`, `${sig.k}/${sig.n}`, `${p2.n - p2.opp}/${p2.n}`];
    const col = [css("--ok"), css("--ok"), css("--struct"), css("--bad"), css("--bad"), css("--bad")];
    plot(pd, [{ type: "bar", orientation: "h", y: cats, x: vals, text: txt, textposition: "outside", marker: { color: col },
      hovertemplate: "%{y}: %{x:.1f}% (%{text})<extra></extra>", cliponaxis: false }],
      { xaxis: { title: "success rate (%)", range: [0, 115] }, yaxis: { autorange: "reversed" }, margin: { l: 200, r: 20, t: 10, b: 48 },
        shapes: [{ type: "line", x0: 50, x1: 50, yref: "paper", y0: 0, y1: 1, line: { dash: "dash", color: css("--muted") } }], showlegend: false });
  });

  root.append(h("h2", {}, "The three studies"));
  const pc = h("div", { class: "papers" });
  const cards = [
    ["p1a", "Paper 1a", "Carrier doping weakens metal–ligand bonds but does not predict phonon softening: an exact electronic/structural decomposition across eighteen two-dimensional carbides and carbide MXenes",
      "Five Ti₃C₂Tₓ MXenes, eight terminated M₂CTₓ and five bare M₂C carbides. The bonding rule depends on the bond type, not on the material family.",
      [`${A.systems.length} monolayers`, `${A.bonds.length} bonds`, `${A.modes.length} optical modes`, "±0.2 e/f.u."]],
    ["p1b", "Paper 1b", "Gate-doped transition-metal dichalcogenide monolayers: a universal metal–chalcogen bonding rule that does not carry over to the phonons",
      "2H semiconductors, 1T semiconductors and 2H metals. In all 12 systems the bond follows the rule, but band filling drives 92% of the mode shifts in directions the bond does not predict.",
      [`${B.systems.length} monolayers`, "3 electronic classes", `${B.modes.length} optical modes`, "jellium spill-out test"]],
    ["p2", "Paper 2", "Hole doping strengthens interlayer bonding yet softens the layer-breathing mode in transition-metal dichalcogenide heterobilayers",
      "MoS₂/WS₂, MoSe₂/WSe₂ and MoTe₂/WTe₂ at two vacuum widths. Only the force-constant curvature and the hole-doped ICOHP are free of jellium artefacts.",
      ["3 heterobilayers", "±0.2 and ±0.4 e/cell", "vacuum 20 Å and 30 Å", "5-point force constants"]],
  ];
  cards.forEach(([id, tag, ttl, txt, chips]) => {
    const c = h("div", { class: "card paper-card", tabindex: "0", role: "link" },
      `<span class="tag">${tag}</span><span class="ttl">${ttl}</span><p>${txt}</p><div class="chips">${chips.map(x => `<span class="chip">${x}</span>`).join("")}</div>`);
    c.onclick = () => showTab(id);
    c.onkeydown = e => { if (e.key === "Enter") showTab(id); };
    pc.append(c);
  });
  root.append(pc);
}

/* ============================================================ PAPER 1a / 1b */
function renderMaterials(root, P, cfg) {
  const fams = cfg.families;
  const famColor = fam => css(cfg.famVar[fams.indexOf(fam)] || "--accent");
  root.innerHTML = cfg.intro;

  /* ---------------- bonds */
  const bb = block(root, "Bond response (ΔICOHP)",
    "ΔICOHP is the change in the integrated crystal-orbital Hamilton population per bond, in eV. A positive value means the bond weakens. <b>Total</b> view: electron and hole doping side by side. <b>Channels</b> view: one carrier, split exactly into band filling + structural relaxation + cross term.");
  const st = { view: "total", carrier: "e", fam: "all" };
  const bplot = plotDiv(bb.b, "plot tall");
  bb.controls.append(
    seg([["total", "Total"], ["chan", "Channels"]], st.view, v => { st.view = v; drawB(); }),
    seg([["e", "Electron"], ["h", "Hole"]], st.carrier, v => { st.carrier = v; drawB(); }),
    select([["all", "All families"], ...fams.map(x => [x, x])], "all", v => { st.fam = v; drawB(); tB.update(bRows()); }, ""));
  const bRows = () => P.bonds.filter(b => st.fam === "all" || b.family === st.fam);
  function drawB() {
    const r = bRows();
    const x = r.map(b => `${plain(b.system)} · ${b.bond}`);
    let tr;
    if (st.view === "total") {
      tr = [["e", "Electron doping", "--e"], ["h", "Hole doping", "--h"]].map(([c, n, v]) => ({
        type: "bar", name: n, x, y: r.map(b => b[c].total), marker: { color: css(v) },
        customdata: r.map(b => [b.icohp0, b.kind, b.follows ? "obeys rule" : "violates rule"]),
        hovertemplate: "%{x}<br>ΔICOHP %{y:.4f} eV<br>ICOHP₀ %{customdata[0]:.3f} eV · %{customdata[1]} · %{customdata[2]}<extra>" + n + "</extra>",
      }));
    } else {
      const c = st.carrier;
      tr = [["elec", "Band filling", "--elec"], ["struct", "Structural", "--struct"], ["cross", "Cross", "--cross"]].map(([k, n, v]) => ({
        type: "bar", name: n, x, y: r.map(b => b[c][k]), marker: { color: css(v) }, hovertemplate: "%{x}<br>" + n + " %{y:.4f} eV<extra></extra>" }));
      tr.push({ type: "scatter", mode: "markers", name: "Total", x, y: r.map(b => b[c].total),
        marker: { symbol: "diamond", size: 8, color: css("--ink"), line: { width: 0 } }, hovertemplate: "%{x}<br>total %{y:.4f} eV<extra></extra>" });
    }
    plot(bplot, tr, { barmode: st.view === "total" ? "group" : "relative", yaxis: { title: "ΔICOHP (eV per bond)" },
      xaxis: { tickangle: -60, tickfont: { size: 10 } }, margin: { l: 60, r: 10, t: 30, b: 150 } });
  }
  reg(drawB);
  const tB = table(bb.b, [
    { k: "system", t: "System", l: 1, fmt: v => chem(v) }, { k: "family", t: "Family", l: 1 },
    { k: "bond", t: "Bond", l: 1 }, { k: "kind", t: "Type", l: 1 }, { k: "mult", t: "Mult." },
    { k: "icohp0", t: "ICOHP₀ (eV)", fmt: v => f(v, 3) },
    { k: "de", t: "Δ e⁻", get: r => r.e.total, fmt: v => sgn(v, 4), cls: r => r.e.total > 0 ? "weak" : "strong", sort: r => r.e.total },
    { k: "deel", t: "e⁻ band fill", get: r => r.e.elec, fmt: v => sgn(v, 4), sort: r => r.e.elec },
    { k: "dh", t: "Δ h⁺", get: r => r.h.total, fmt: v => sgn(v, 4), cls: r => r.h.total > 0 ? "weak" : "strong", sort: r => r.h.total },
    { k: "dhel", t: "h⁺ band fill", get: r => r.h.elec, fmt: v => sgn(v, 4), sort: r => r.h.elec },
    { k: "follows", t: "Obeys rule", fmt: v => v ? `<span class="yes">yes</span>` : `<span class="no">no</span>` },
  ], bRows());

  /* ---------------- mode statistics */
  root.append(h("h2", {}, "Phonons: do the modes follow the bonds?"));
  const g = h("div", { class: "grid2" }); root.append(g);
  const mb = block(g, "Band filling vs structural relaxation",
    "Each point is one zone-centre optical mode. Points near the dashed line y = −x are modes where the two channels cancel.");
  const ms = { carrier: "e" };
  mb.controls.append(seg([["e", "Electron"], ["h", "Hole"]], "e", v => { ms.carrier = v; drawM(); }));
  const mplot = plotDiv(mb.b);
  function drawM() {
    const c = ms.carrier;
    const tr = fams.map(fam => {
      const r = P.modes.filter(m => m.family === fam && m[c]);
      return { type: "scattergl", mode: "markers", name: fam, x: r.map(m => m[c].elec), y: r.map(m => m[c].struct),
        marker: { color: famColor(fam), size: 7, opacity: .8 },
        text: r.map(m => `${plain(m.system)} ${m.sym ? m.sym + " " : ""}${f(m.w0, 1)} cm⁻¹<br>total ${sgn(m[c].total, 2)}`),
        hovertemplate: "%{text}<br>band filling %{x:.2f}<br>structural %{y:.2f} cm⁻¹<extra></extra>" };
    });
    const all = P.modes.filter(m => m[c]).flatMap(m => [m[c].elec, m[c].struct]);
    const lim = Math.max(...all.map(Math.abs)) * 1.05;
    tr.push({ type: "scatter", mode: "lines", x: [-lim, lim], y: [lim, -lim], line: { dash: "dash", color: css("--muted"), width: 1 }, hoverinfo: "skip", showlegend: false });
    plot(mplot, tr, { xaxis: { title: "band-filling shift (cm⁻¹)", range: [-lim, lim] }, yaxis: { title: "structural shift (cm⁻¹)", range: [-lim, lim] } });
  }
  reg(drawM);

  const tw = block(g, "Direction test",
    "Shows how each mode shifts under electrons and under holes. The bonding argument expects <i>softens under e⁻, hardens under h⁺</i> for every mode.");
  const twplot = plotDiv(tw.b);
  reg(() => {
    const keys = cfg.threewayKeys;
    const tr = [["canonical", "--ok"], ["anti", "--bad"], ["same", "--struct"]].map(([k, v]) => ({
      type: "bar", name: DIR_LABEL[k], x: keys.map(([, lab]) => lab), y: keys.map(([key]) => P.threeway[key]["pct_" + k]),
      customdata: keys.map(([key]) => [P.threeway[key][k], P.threeway[key].total]), marker: { color: css(v) },
      hovertemplate: "%{x}<br>%{y:.1f}% (%{customdata[0]} of %{customdata[1]} modes)<extra>" + DIR_LABEL[k] + "</extra>" }));
    plot(twplot, tr, { barmode: "stack", yaxis: { title: "share of modes (%)", range: [0, 100] }, legend: { orientation: "h", y: -0.25 },
      margin: { l: 56, r: 10, t: 10, b: 90 },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 25, y1: 25, line: { dash: "dot", color: css("--ink") } }],
      annotations: [{ xref: "paper", x: 1, y: 25, text: "chance 25%", showarrow: false, xanchor: "right", yanchor: "bottom", font: { size: 10, color: css("--ink-2") } }] });
  });

  /* ---------------- per-system mode explorer */
  const sysList = [...new Set(P.modes.map(m => m.system))];
  const me = block(root, "Mode explorer",
    "Choose a system to see how each of its optical modes shifts. Switch to <b>Channels</b> to see the band-filling, structural and cross parts for one carrier.");
  const mst = { sys: cfg.defaultSys || sysList[0], view: "total", carrier: "e" };
  me.controls.append(
    select(sysList.map(s => [s, plain(s)]), mst.sys, v => { mst.sys = v; drawME(); tM.update(meRows()); }, "System"),
    seg([["total", "Total"], ["chan", "Channels"]], "total", v => { mst.view = v; drawME(); }),
    seg([["e", "Electron"], ["h", "Hole"]], "e", v => { mst.carrier = v; drawME(); }));
  const meplot = plotDiv(me.b);
  const meRows = () => P.modes.filter(m => m.system === mst.sys);
  function drawME() {
    const r = meRows();
    const x = r.map(m => `${m.sym ? m.sym + " " : ""}${f(m.w0, 2)}`);
    let tr;
    if (mst.view === "total") {
      tr = [["e", "Electron doping", "--e"], ["h", "Hole doping", "--h"]].map(([c, n, v]) => ({
        type: "bar", name: n, x, y: r.map(m => m[c] ? m[c].total : null), marker: { color: css(v) },
        hovertemplate: "ω₀ %{x} cm⁻¹<br>Δω %{y:.2f} cm⁻¹<extra>" + n + "</extra>" }));
    } else {
      const c = mst.carrier;
      tr = [["elec", "Band filling", "--elec"], ["struct", "Structural", "--struct"], ["cross", "Cross", "--cross"]].map(([k, n, v]) => ({
        type: "bar", name: n, x, y: r.map(m => m[c] ? m[c][k] : null), marker: { color: css(v) }, hovertemplate: n + " %{y:.2f} cm⁻¹<extra></extra>" }));
      tr.push({ type: "scatter", mode: "markers", name: "Total", x, y: r.map(m => m[c] ? m[c].total : null),
        marker: { symbol: "diamond", size: 9, color: css("--ink") }, hovertemplate: "total %{y:.2f} cm⁻¹<extra></extra>" });
    }
    plot(meplot, tr, { barmode: mst.view === "total" ? "group" : "relative", xaxis: { title: "undoped frequency ω₀ (cm⁻¹)", type: "category" }, yaxis: { title: "Δω (cm⁻¹)" } });
  }
  reg(drawME);
  const tM = table(me.b, [
    { k: "w0", t: "ω₀ (cm⁻¹)", l: 1, fmt: (v, r) => `${r.sym ? r.sym + " " : ""}${f(v, 2)}` },
    { k: "et", t: "Δω e⁻", get: r => r.e.total, fmt: v => sgn(v, 2), sort: r => r.e.total },
    { k: "ee", t: "band fill", get: r => r.e.elec, fmt: v => sgn(v, 2), sort: r => r.e.elec },
    { k: "es", t: "struct.", get: r => r.e.struct, fmt: v => sgn(v, 2), sort: r => r.e.struct },
    { k: "ht", t: "Δω h⁺", get: r => r.h ? r.h.total : null, fmt: v => v === null ? "–" : sgn(v, 2), sort: r => r.h ? r.h.total : 0 },
    { k: "he", t: "band fill", get: r => r.h ? r.h.elec : null, fmt: v => v === null ? "–" : sgn(v, 2), sort: r => r.h ? r.h.elec : 0 },
    { k: "hs", t: "struct.", get: r => r.h ? r.h.struct : null, fmt: v => v === null ? "–" : sgn(v, 2), sort: r => r.h ? r.h.struct : 0 },
    { k: "dir", t: "Direction", l: 1, get: r => dirClass(r), fmt: v => v ? `<span class="pill ${v}">${DIR_LABEL[v]}</span>` : "–" },
  ], meRows());

  /* ---------------- lattice + stiffness */
  const g2 = h("div", { class: "grid2" }); root.append(g2);
  const lb = block(g2, "Lattice constant", "Relative change in the in-plane lattice constant on full relaxation of the doped cell.");
  const lplot = plotDiv(lb.b);
  reg(() => {
    const r = P.systems;
    plot(lplot, [["de_pct", "Electron", "--e"], ["dh_pct", "Hole", "--h"]].map(([k, n, v]) => ({
      type: "bar", name: n, x: r.map(s => plain(s.system)), y: r.map(s => s[k]), marker: { color: css(v) },
      customdata: r.map(s => s.a0), hovertemplate: "%{x}<br>Δa/a %{y:.3f}%<br>a₀ %{customdata:.4f} Å<extra>" + n + "</extra>" })),
      { barmode: "group", yaxis: { title: "Δa / a₀ (%)" }, xaxis: { tickangle: -50, tickfont: { size: 10 } }, margin: { l: 56, r: 10, t: 30, b: 100 } });
  });
  const sb = block(g2, "Bond stiffness vs bond strength",
    `Pair stiffness reconstructed from the Γ-point force constants (${P.stiffness.length} bonds). If stiffness simply followed strength, all points would lie in the shaded quadrants.`);
  const splot = plotDiv(sb.b);
  reg(() => {
    const r = P.stiffness;
    const tr = [["e", "Electron", "--e", "circle"], ["h", "Hole", "--h", "square"]].map(([c, n, v, sym]) => ({
      type: "scatter", mode: "markers", name: n, x: r.map(b => b["dicohp_" + c]), y: r.map(b => b["dk_rel_" + c]),
      marker: { color: css(v), size: 8, symbol: sym, opacity: .85 },
      text: r.map(b => `${plain(b.system)} ${b.bond}`), hovertemplate: "%{text}<br>ΔICOHP %{x:.4f} eV<br>Δk/k %{y:.2f}%<extra>" + n + "</extra>" }));
    const xs = r.flatMap(b => [b.dicohp_e, b.dicohp_h]), ys = r.flatMap(b => [b.dk_rel_e, b.dk_rel_h]);
    const X = Math.max(...xs.map(Math.abs)) * 1.1, Y = Math.max(...ys.map(Math.abs)) * 1.1;
    const shade = css("--ok");
    plot(splot, tr, { xaxis: { title: "ΔICOHP (eV; >0 = weaker)", range: [-X, X] }, yaxis: { title: "Δk / k (%)", range: [-Y, Y] },
      shapes: [{ type: "rect", x0: -X, x1: 0, y0: 0, y1: Y, fillcolor: shade, opacity: .08, line: { width: 0 } },
        { type: "rect", x0: 0, x1: X, y0: -Y, y1: 0, fillcolor: shade, opacity: .08, line: { width: 0 } }],
      annotations: [{ x: -X * .5, y: Y * .92, text: "stronger & stiffer", showarrow: false, font: { size: 10, color: css("--ink-2") } },
        { x: X * .5, y: -Y * .92, text: "weaker & softer", showarrow: false, font: { size: 10, color: css("--ink-2") } }] });
  });

  /* ---------------- doping series */
  const series = P.series;
  const sys0 = Object.keys(series)[0];
  const ds = block(root, "Fine doping series (−0.3 … +0.3 e/f.u.)",
    "Shows any quantity as a function of carrier density n (n > 0 means added electrons). The dashed curve is the parabola through the production points n = 0, ±0.2. Where the data leave this curve, the response stops being quadratic.");
  const dss = { sys: sys0, q: null };
  const qOpts = s => Object.keys(series[s].q).filter(k => series[s].q[k].values.every(v => v !== null));
  const QLAB = { a_min: "lattice constant a (Å)", a_p4: "a, quartic fit (Å)", a_fixc: "a, fixed c (Å)", spill_pct: "LOBSTER charge spilling (%)" };
  const qlab = k => QLAB[k] || (k.startsWith("w:") ? `ω(${k.slice(2)}) (cm⁻¹)` : k.startsWith("icohp:") ? `ICOHP ${k.slice(6)} (eV)` : k);
  dss.q = cfg.defaultQ && qOpts(sys0).includes(cfg.defaultQ) ? cfg.defaultQ : qOpts(sys0)[0];
  let qSel;
  const sysSel = select(Object.keys(series).map(s => [s, plain(s)]), sys0, v => {
    dss.sys = v; const opts = qOpts(v); if (!opts.includes(dss.q)) dss.q = opts[0]; rebuildQ(); drawS(); }, "System");
  function rebuildQ() {
    const n = select(qOpts(dss.sys).map(k => [k, qlab(k)]), dss.q, v => { dss.q = v; drawS(); }, "Quantity");
    if (qSel) qSel.replaceWith(n); else ds.controls.append(n);
    qSel = n;
  }
  ds.controls.append(sysSel); rebuildQ();
  const dplot = plotDiv(ds.b);
  function drawS() {
    const S = series[dss.sys], Q = S.q[dss.q];
    const x0 = Q.values[S.n.indexOf(0)];
    const tr = [{ type: "scatter", mode: "lines+markers", name: "DFT", x: S.n, y: Q.values,
      marker: { size: 9, color: S.n.map(n => n > 0 ? css("--e") : n < 0 ? css("--h") : css("--ink")) }, line: { color: css("--muted"), width: 1 },
      hovertemplate: "n = %{x:+.2f}<br>%{y:.4f}<extra></extra>" }];
    if (Q.alpha3 !== null && Q.alpha3 !== undefined) {
      const xs = Array.from({ length: 61 }, (_, i) => -0.3 + i * 0.01);
      tr.push({ type: "scatter", mode: "lines", name: "±0.2 parabola", x: xs, y: xs.map(n => x0 + Q.alpha3 * n + Q.beta3 * n * n),
        line: { dash: "dash", color: css("--accent") }, hoverinfo: "skip" });
    }
    plot(dplot, tr, { xaxis: { title: "carrier density n (e per formula unit; + = electrons)", zeroline: true }, yaxis: { title: qlab(dss.q) } });
  }
  reg(drawS);

  if (cfg.extra) cfg.extra(root, P);

  root.append(h("h2", {}, "Manuscript figures"));
  gallery(root, cfg.figs);
}

/* ---------- Paper 1b extras: jellium spill-out */
function spillBlocks(root, P) {
  root.append(h("h2", {}, "Where does the doping charge go?"));
  const g = h("div", { class: "grid2" }); root.append(g);
  const a = block(g, "Jellium spill-out at ±0.2 e",
    "Shares of the added carrier that sit on the slab and far out in the vacuum. These come from the planar-averaged doped-minus-undoped density. Electrons can spill into the vacuum and holes do not.");
  const st = { k: 0 };
  const Lz = [...new Set(P.spill.map(r => r.k))].sort();
  a.controls.append(seg(Lz.map(k => [k, `Lz ${f(P.spill.find(r => r.k === k).Lz, 0)} Å`]), 0, v => { st.k = v; draw(); }));
  const p = plotDiv(a.b);
  function draw() {
    const sys = P.order.filter(s => P.spill.some(r => r.sys === s && r.k === st.k));
    const get = (s, q, key) => { const r = P.spill.find(r => r.sys === s && r.q === q && r.k === st.k); return r ? 100 * r[key] : null; };
    plot(p, [
      { type: "bar", name: "e⁻ on slab", x: sys.map(plain), y: sys.map(s => get(s, "e", "on_frac")), marker: { color: css("--e") } },
      { type: "bar", name: "e⁻ far vacuum", x: sys.map(plain), y: sys.map(s => get(s, "e", "far_frac")), marker: { color: css("--e"), pattern: { shape: "/" }, opacity: .55 } },
      { type: "bar", name: "h⁺ on slab", x: sys.map(plain), y: sys.map(s => get(s, "h", "on_frac")), marker: { color: css("--h") } },
    ], { barmode: "group", yaxis: { title: "share of added carrier (%)", range: [0, 105] }, xaxis: { tickangle: -45 } });
  }
  reg(draw);
  const b = block(g, "MoS₂: spill-out onset vs carrier density",
    "Electrons stay on the slab up to +0.10 e. Between +0.10 and +0.15 e they begin to occupy vacuum states, at the point where V<sub>vac</sub> − E<sub>F</sub> collapses.");
  const p2 = plotDiv(b.b);
  reg(() => {
    const r = P.spill_n_mos2;
    plot(p2, [
      { type: "scatter", mode: "lines+markers", name: "on slab (%)", x: r.map(x => x.n), y: r.map(x => 100 * x.on_frac), marker: { size: 8, color: css("--accent") } },
      { type: "scatter", mode: "lines+markers", name: "far vacuum (%)", x: r.map(x => x.n), y: r.map(x => 100 * x.far_frac), marker: { size: 8, color: css("--bad") } },
      { type: "scatter", mode: "lines+markers", name: "V<sub>vac</sub> − E<sub>F</sub> (eV)", x: r.map(x => x.n), y: r.map(x => x.vvac_minus_ef), yaxis: "y2", line: { dash: "dot" }, marker: { size: 7, color: css("--struct") } },
    ], { xaxis: { title: "n (e per f.u.; + = electrons)" }, yaxis: { title: "share of added carrier (%)", range: [0, 105] },
      yaxis2: { title: "V<sub>vac</sub> − E<sub>F</sub> (eV)", overlaying: "y", side: "right", showgrid: false }, margin: { l: 56, r: 56, t: 30, b: 48 } });
  });
}

/* ============================================================ PAPER 2 */
function p2Summary() {
  const C = D.paper2;
  let opp = 0, n = 0;
  C.pairs.forEach(p => {
    const ic = q => C.bond.find(b => b.pair === p && b.vac === 20 && b.q === q).icohp;
    const kk = q => C.k.find(b => b.pair === p && b.vac === 20 && b.q === q).k;
    n++;
    if (ic("qh2") < ic("q0") && kk("qh2") < kk("q0")) opp++;
  });
  return { opp, n };
}
function renderPaper2() {
  const root = $("#p2");
  const C = D.paper2;
  const PC = ["#d4a017", "#2e8b57", "#7d3c98"];
  const pcol = p => PC[C.pairs.indexOf(p)];
  const row = (arr, p, v, q) => arr.find(b => b.pair === p && b.vac === v && b.q === q);
  const rel = (p, q) => { const a = row(C.bond, p, 20, q).icohp, b = row(C.bond, p, 20, "q0").icohp; return -100 * (a - b) / Math.abs(b); };
  const dk = (p, q) => { const a = row(C.k, p, 20, q).k, b = row(C.k, p, 20, "q0").k; return 100 * (a - b) / b; };
  const dw = (p, q) => row(C.k, p, 20, q).w - row(C.k, p, 20, "q0").w;
  const hb = C.pairs.map(p => rel(p, "qh2")), hk = C.pairs.map(p => dk(p, "qh2")), hw = C.pairs.map(p => dw(p, "qh2"));

  root.innerHTML = `
    <h1>Paper 2 · Interlayer bonding in TMD heterobilayers</h1>
    <p class="lede">The low-frequency layer-breathing Raman mode is the standard probe of interlayer coupling, and gate-induced
    shifts of this mode are usually read as changes in interlayer bond strength. This study tests that reading on MoS₂/WS₂,
    MoSe₂/WSe₂ and MoTe₂/WTe₂ with a compensating jellium background. Every doped calculation is repeated at 20 Å and 30 Å
    of vacuum so that results which depend on the background can be identified and set aside.</p>
    <div class="cards">
      <div class="card good"><div class="big">+${f(Math.min(...hb), 0)}–${f(Math.max(...hb), 0)}%</div><div class="lab">interlayer bond strengthening under 0.2 e/cell hole doping (−ΔICOHP/|ICOHP₀|)</div></div>
      <div class="card bad"><div class="big">${f(Math.max(...hk), 1)} to ${f(Math.min(...hk), 1)}%</div><div class="lab">change in the breathing force constant under the same hole doping</div></div>
      <div class="card bad"><div class="big">${hw.map(x => f(x, 1)).join(" / ")}</div><div class="lab">breathing-mode shift in cm⁻¹ (S / Se / Te)</div></div>
      <div class="card"><div class="big">≤0.5%</div><div class="lab">vacuum dependence of the force constant. Total energies change by up to 0.5 eV between the two vacuum widths.</div></div>
    </div>`;

  const g = h("div", { class: "grid2" }); root.append(g);
  const a = block(g, "Interlayer chalcogen–chalcogen ICOHP",
    "Uses the shortest interlayer X···X contacts at the frozen undoped geometry. Solid lines show 20 Å vacuum and dotted lines 30 Å. A more negative value means a stronger bond.");
  const pa = plotDiv(a.b);
  reg(() => {
    const tr = [];
    C.pairs.forEach(p => [20, 30].forEach(v => {
      const r = C.bond.filter(b => b.pair === p && b.vac === v).sort((x, y) => x.n - y.n);
      tr.push({ type: "scatter", mode: "lines+markers", name: `${plain(p)} · ${v} Å`, x: r.map(b => b.n), y: r.map(b => b.icohp),
        line: { color: pcol(p), dash: v === 20 ? "solid" : "dot" }, marker: { size: 8, color: pcol(p) }, legendgroup: p, showlegend: v === 20,
        customdata: r.map(b => [b.contact, b.spill]), hovertemplate: `${plain(p)} vac ${v} Å<br>n %{x:+.1f} e<br>ICOHP %{y:.4f} eV<br>contact %{customdata[0]:.3f} Å<extra></extra>` });
    }));
    plot(pa, tr, { xaxis: { title: "doping (e per cell; − = holes)" }, yaxis: { title: "ICOHP per X···X contact (eV)" } });
  });

  const b = block(g, "Layer-breathing mode", "Uses a rigid top-layer displacement fitted over 5 points (0, ±0.02, ±0.06 Å), at two vacuum widths.");
  const bs = { q: "w" };
  b.controls.append(seg([["w", "ω (cm⁻¹)"], ["k", "k (eV/Å²)"]], "w", v => { bs.q = v; drawK(); }));
  const pb = plotDiv(b.b);
  function drawK() {
    const tr = [];
    C.pairs.forEach(p => [20, 30].forEach(v => {
      const r = C.k.filter(x => x.pair === p && x.vac === v).sort((x, y) => x.n - y.n);
      tr.push({ type: "scatter", mode: "lines+markers", name: `${plain(p)} · ${v} Å`, x: r.map(x => x.n), y: r.map(x => x[bs.q]),
        error_y: bs.q === "k" ? { type: "data", array: r.map(x => x.kerr), visible: true, color: pcol(p) } : undefined,
        line: { color: pcol(p), dash: v === 20 ? "solid" : "dot" }, marker: { size: 8, color: pcol(p) }, legendgroup: p, showlegend: v === 20,
        hovertemplate: `${plain(p)} vac ${v} Å<br>n %{x:+.1f}<br>%{y:.4f}<extra></extra>` });
    }));
    plot(pb, tr, { xaxis: { title: "doping (e per cell; − = holes)" }, yaxis: { title: bs.q === "w" ? "ω<sub>LB</sub> (cm⁻¹)" : "k (eV Å⁻²)" } });
  }
  reg(drawK);

  const c = block(root, "Bond strength and mode stiffness move in opposite directions",
    "Shows the relative change under hole and electron doping at ±0.2 e/cell with 20 Å vacuum. Under hole doping the bond becomes stronger (positive) while the breathing force constant falls (negative), in all three pairs.");
  const cs = { q: "qh2" };
  c.controls.append(seg([["qh2", "Hole 0.2"], ["qh4", "Hole 0.4"], ["qe2", "Electron 0.2"], ["qe4", "Electron 0.4"]], "qh2", v => { cs.q = v; drawC(); }));
  const pc = plotDiv(c.b);
  function drawC() {
    const hasB = C.bond.some(b => b.q === cs.q);
    const tr = [];
    if (hasB) tr.push({ type: "bar", name: "bond strength −ΔICOHP/|ICOHP₀|", x: C.pairs.map(plain), y: C.pairs.map(p => rel(p, cs.q)), marker: { color: css("--ok") }, hovertemplate: "%{x}: %{y:+.1f}%<extra></extra>" });
    tr.push({ type: "bar", name: "force constant Δk/k", x: C.pairs.map(plain), y: C.pairs.map(p => dk(p, cs.q)), marker: { color: css("--bad") }, hovertemplate: "%{x}: %{y:+.2f}%<extra></extra>" });
    plot(pc, tr, { barmode: "group", yaxis: { title: "relative change (%)" },
      annotations: hasB ? [] : [{ xref: "paper", yref: "paper", x: .5, y: 1.05, text: "ICOHP computed at ±0.2 e only", showarrow: false, font: { size: 11, color: css("--muted") } }] });
  }
  reg(drawC);

  const g2 = h("div", { class: "grid2" }); root.append(g2);
  const d = block(g2, "Why vacuum width matters: MoS₂/WS₂ binding curves",
    "E(gap) − E(9 Å) at both vacuum widths. The neutral curves overlap exactly. The doped curves shift by up to 0.5 eV and even change sign, because the jellium background acts on the slab as a uniform field.");
  const pd = plotDiv(d.b);
  reg(() => {
    const L = { q0: ["neutral", "--ink"], qh2: ["hole 0.2 e", "--h"], qh4: ["hole 0.4 e", "--bad"] };
    const tr = [];
    Object.entries(C.bind).forEach(([q, rows]) => [1, 2].forEach(j => tr.push({
      type: "scatter", mode: "lines+markers", name: `${L[q][0]} · ${j === 1 ? 20 : 30} Å`, x: rows.map(r => r[0]), y: rows.map(r => r[j]),
      line: { color: css(L[q][1]), dash: j === 1 ? "solid" : "dot" }, marker: { size: 7, color: css(L[q][1]) },
      hovertemplate: "gap %{x} Å<br>ΔE %{y:.4f} eV<extra></extra>" })));
    plot(pd, tr, { xaxis: { title: "interlayer gap (Å)" }, yaxis: { title: "E − E(9 Å) (eV)" } });
  });
  const e = block(g2, "Shear mode", C.shear ? "Rigid in-plane shear displacement of the top layer." : "");
  if (!C.shear) {
    e.b.append(h("div", { class: "callout" }, "The interlayer shear-mode campaign (rigid in-plane displacement of the top layer, same 5-point protocol, both vacuum widths) is still running on PARAM Rudra. Its results will appear here once the analysis is finished."));
  } else {
    const ps = plotDiv(e.b);
    reg(() => {
      const S = C.shear.rows || [];
      const tr = C.pairs.map(p => { const r = S.filter(x => x.pair === p && x.vac === 20).sort((a, b) => a.n - b.n);
        return { type: "scatter", mode: "lines+markers", name: plain(p), x: r.map(x => x.n), y: r.map(x => x.w), line: { color: pcol(p) }, marker: { size: 8, color: pcol(p) } }; });
      plot(ps, tr, { xaxis: { title: "doping (e per cell)" }, yaxis: { title: "ω<sub>S</sub> (cm⁻¹)" } });
    });
  }

  const t = block(root, "All breathing-mode force constants", "Table of every fit. Click a column header to sort.");
  table(t.b, [
    { k: "pair", t: "Pair", l: 1, fmt: v => chem(v) }, { k: "vac", t: "Vacuum (Å)" }, { k: "n", t: "Doping (e/cell)", fmt: v => sgn(v, 1) },
    { k: "k", t: "k (eV/Å²)", fmt: v => f(v, 4) }, { k: "kerr", t: "± fit", fmt: v => f(v, 4) }, { k: "w", t: "ω<sub>LB</sub> (cm⁻¹)", fmt: v => f(v, 2) },
  ], C.k);

  root.append(h("h2", {}, "Manuscript figures"));
  gallery(root, "paper2");
}

/* ============================================================ FIGURES + ABOUT */
function renderFigs() {
  const root = $("#figs");
  root.innerHTML = `<h1>Figure gallery</h1><p class="lede">All main-text and supplementary figures from the three manuscripts. Click a figure to enlarge it.</p>`;
  [["paper1a", "Paper 1a · Carbides & MXenes"], ["paper1b", "Paper 1b · TMD monolayers"], ["paper2", "Paper 2 · Heterobilayers"]].forEach(([p, t]) => {
    root.append(h("h2", {}, t)); gallery(root, p);
  });
}
function renderAbout() {
  $("#about").innerHTML = `
    <h1>Methods &amp; data</h1>
    <p class="lede">All three studies use one protocol so that their results can be compared directly. That protocol is summarised below,
    together with the definitions behind every quantity shown on this site.</p>
    <dl class="defs">
      <dt>Electronic structure</dt><dd>VASP (PAW, PBE with Grimme D2 dispersion) with LOBSTER for COHP. Zone-centre phonons come from DFPT (monolayers) or from rigid-layer finite differences (bilayers).</dd>
      <dt>Doping</dt><dd>Rigid-band carrier doping of ±0.2 e per formula unit (monolayers) or per cell (bilayers), with a compensating uniform background. A fine series spans −0.3 to +0.3 e/f.u.</dd>
      <dt>Exact decomposition</dt><dd>Three auxiliary calculations, besides the undoped (U) and fully relaxed doped (D) states, separate every response. Band filling (BF) uses the doped electron count at the undoped geometry. Structural (S) uses the doped geometry at the neutral electron count. Then band filling = BF − U, structural = S − U and cross = D − BF − S + U, so that total = band filling + structural + cross holds exactly.</dd>
      <dt>ICOHP</dt><dd>Integrated COHP up to E<sub>F</sub>, per symmetry-inequivalent bond, with a distance cutoff derived for each system that sits between the first and second coordination shells. More negative means stronger. ΔICOHP &gt; 0 means the bond weakens.</dd>
      <dt>Bonding rule</dt><dd>A bond obeys the rule if it weakens under electron doping and strengthens under hole doping.</dd>
      <dt>Direction classes</dt><dd>A mode is <i>canonical</i> if it softens under electrons and hardens under holes, <i>anti</i> for the reverse, and <i>same</i> if it shifts in the same direction under both. Chance would put 25% in each of the first two classes.</dd>
      <dt>Odd / even parts</dt><dd>L = (Δ<sub>e</sub> − Δ<sub>h</sub>)/2 and Q = (Δ<sub>e</sub> + Δ<sub>h</sub>)/2. α = L/|n| is the linear coefficient and β = Q/n² the quadratic one.</dd>
      <dt>Jellium check</dt><dd>The planar-averaged doped-minus-undoped density gives the share of the carrier that sits on the slab and the share far out in the vacuum. For the bilayers, every doped observable is repeated at 20 Å and 30 Å of vacuum, and only quantities that agree at both widths are interpreted.</dd>
      <dt>Breathing force constant</dt><dd>Rigid top-layer displacement δ ∈ {0, ±0.02, ±0.06} Å with a quadratic fit of the net force, k = −dF/dδ. ω = (1/2πc)√(k/μ), where μ is the reduced layer mass.</dd>
    </dl>
    <h2>Data</h2>
    <p>Everything on this site is generated from one file, <a href="data/results.json" download>data/results.json</a>, which you can download and reuse.
    The script <span class="mono">build_data.py</span> in the repository regenerates it from the analysis outputs.</p>`;
}

/* ============================================================ boot */
function initTheme() {
  const btn = $("#theme");
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* ignore */ }
  if (saved) document.documentElement.dataset.theme = saved;
  btn.onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    renderers.forEach(fn => fn());
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderers.forEach(fn => fn()));
}

async function boot() {
  initTheme();
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  const lb = $("#lightbox");
  lb.onclick = e => { if (e.target !== $("img", lb)) lb.hidden = true; };
  document.addEventListener("keydown", e => { if (e.key === "Escape") lb.hidden = true; });
  try {
    D = await (await fetch("data/results.json")).json();
  } catch (e) {
    $("#loading").textContent = "Could not load data/results.json. Serve this folder over HTTP (for example with python3 -m http.server).";
    return;
  }
  $("#loading").remove();
  renderOverview();
  renderMaterials($("#p1a"), D.paper1a, {
    figs: "paper1a", families: ["Ti₃C₂Tₓ MXene", "terminated M₂CTₓ", "bare M₂C"], famVar: ["--accent", "--struct", "--h"],
    threewayKeys: [["part1", "Ti₃C₂Tₓ"], ["part3", "M₂CTₓ"], ["part4", "bare M₂C"]], defaultSys: "Mo2C", defaultQ: "w:A1g",
    intro: `<h1>Paper 1a · Carbides &amp; MXenes</h1>
      <p class="lede">The study covers eighteen monolayers: five Ti₃C₂Tₓ MXenes, eight terminated M₂CTₓ (M = Mo, Nb, V; Tₓ = O₂, (OH)₂, F₂) and five bare M₂C carbides,
      each doped by ±0.2 e/f.u. Every bond and every zone-centre optical mode is split exactly into band-filling, structural and cross channels.</p>
      <div class="callout">The bonding rule depends on the bond type, not on the material family. All 29 metal–ligand bonds obey it. Only 3 of the 13 metal–metal bonds do,
      because the metal–metal band-filling channel reverses sign under hole doping. Even where the rule holds, it predicts the sign of the phonon shift for only 47% of modes.</div>`,
  });
  renderMaterials($("#p1b"), D.paper1b, {
    figs: "paper1b", families: ["2H-sc", "1T-sc", "2H-metal"], famVar: ["--accent", "--struct", "--h"],
    threewayKeys: [["all", "all"], ["2H-sc", "2H semicond."], ["1T-sc", "1T semicond."], ["2H-metal", "2H metals"]], defaultSys: "MoS2", defaultQ: "w:A1'",
    extra: spillBlocks,
    intro: `<h1>Paper 1b · Transition-metal dichalcogenide monolayers</h1>
      <p class="lede">The study covers twelve monolayers in three electronic classes: trigonal-prismatic semiconductors (Mo, W)(S, Se, Te)₂, octahedral semiconductors
      PtS₂, PtSe₂, HfS₂ and ZrS₂, and the trigonal-prismatic metals NbSe₂ and TaS₂.</p>
      <div class="callout">The metal–chalcogen bond obeys the rule in all 12 systems, and band filling has the canonical sign in all 24 cases. Band filling also
      dominates 92% of mode shifts, yet the bond predicts the sign of only 45% of them. Hole doping strengthens the bond while lowering its stiffness in all 8 systems tested.</div>`,
  });
  renderPaper2();
  renderFigs();
  renderAbout();
  const t = (location.hash || "").slice(1);
  if (t && document.getElementById(t)) showTab(t);
}
document.addEventListener("DOMContentLoaded", () => {
  const go = () => window.Plotly ? boot() : setTimeout(go, 50);
  go();
});
