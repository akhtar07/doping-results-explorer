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

/* sortable table: cols = [{k, t, fmt, cls}], rowCls(row) -> class of the <tr> */
function table(parent, cols, rows, rowCls) {
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
    tb.innerHTML = r.map(row => `<tr class="${rowCls ? rowCls(row) || "" : ""}">` + cols.map(c => {
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
  fig3_breathing: "Layer-breathing and shear force constants and frequencies vs doping",
  fig4_bond_vs_mode: "Interlayer bond strengthening vs breathing and shear softening",
  fig5_charge_cohp: "Where the doped charge resides, and the band-edge interlayer COHP",
  figS1_charge_all: "Doped-charge profiles Δρ(z) of all twelve bilayers at both vacuum widths",
  figS_allbonds_1b: "Every bond of the TMDs: full and band-filling ΔICOHP under electrons vs holes, and canonical/anti class counts by bond type (metal–ligand canonical in every system)",
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
  const ma = A.modetest.summary.ALL, mb = B.modetest.summary.ALL;
  const pc = o => 100 * o.follow / o.tested;
  const p2 = p2Summary();
  const nShifts = A.modes.reduce((s, m) => s + 1 + (m.h ? 1 : 0), 0) + B.modes.reduce((s, m) => s + 1 + (m.h ? 1 : 0), 0);

  root.innerHTML = `
    <h1>Does a stronger bond mean a stiffer lattice?</h1>
    <p class="lede">Gate-induced phonon shifts in two-dimensional materials are usually explained with a bonding argument:
    added electrons fill antibonding states, bonds weaken, and modes soften. These three first-principles studies test
    each step of that argument for ${A.systems.length} carbide and MXene monolayers, ${B.systems.length} transition-metal
    dichalcogenide monolayers and ${C.pairs.length} van der Waals bilayers. Every bond LOBSTER computes is analysed, not only a chosen few.
    The most affected bond of every monolayer obeys the bonding rule, and the bond changes do predict the structural part of each phonon shift, but they do not predict
    the total shift, which band filling dominates.</p>
    <div class="cards">
      <div class="card"><div class="big">${A.systems.length + B.systems.length + C.pairs.length}</div><div class="lab">materials, each doped with electrons and with holes</div></div>
      <div class="card good"><div class="big">${mlOK + bOK}/${ml.length + B.bonds.length}</div><div class="lab">metal–ligand bonds weaken under electrons and strengthen under holes</div></div>
      <div class="card bad"><div class="big">${f(pc(ma.total), 0)}% · ${f(pc(mb.total), 0)}%</div><div class="lab">total phonon shifts whose sign the stretch-weighted bond changes predict (1a · 1b). Chance would give 50%.</div></div>
      <div class="card good"><div class="big">${f(pc(ma.struct), 0)}% · ${f(pc(mb.struct), 0)}%</div><div class="lab">structural-channel shifts the same bond changes predict (1a · 1b)</div></div>
      <div class="card bad"><div class="big">${p2.opp}/${p2.n}</div><div class="lab">bilayers where hole doping strengthens the interlayer bond but softens the breathing mode</div></div>
    </div>`;
  const b1 = block(root, "The bonding rule against the phonon prediction",
    `Green bars show the share of tracked bonds that obey the rule. The other bars show the share of mode shifts whose sign the stretch-weighted bond changes predict, for the total shift (red) and for its structural channel (orange). The dashed line marks chance (50%). In total ${nShifts} DFPT mode shifts were tested.`);
  const pd = plotDiv(b1.b);
  reg(() => {
    const cats = ["1a metal–ligand bonds", "1b metal–chalcogen bonds", "1a metal–metal bonds",
      "1a mode sign: total", "1b mode sign: total", "1a mode sign: structural", "1b mode sign: structural", "2 breathing mode vs bond (h⁺)"];
    const vals = [100 * mlOK / ml.length, 100 * bOK / B.bonds.length, 100 * mmOK / mm.length,
      pc(ma.total), pc(mb.total), pc(ma.struct), pc(mb.struct), 100 * (p2.n - p2.opp) / p2.n];
    const fr = o => `${o.follow}/${o.tested}`;
    const txt = [`${mlOK}/${ml.length}`, `${bOK}/${B.bonds.length}`, `${mmOK}/${mm.length}`,
      fr(ma.total), fr(mb.total), fr(ma.struct), fr(mb.struct), `${p2.n - p2.opp}/${p2.n}`];
    const col = [css("--ok"), css("--ok"), css("--struct"), css("--bad"), css("--bad"), css("--struct"), css("--struct"), css("--bad")];
    plot(pd, [{ type: "bar", orientation: "h", y: cats, x: vals, text: txt, textposition: "outside", marker: { color: col },
      hovertemplate: "%{y}: %{x:.1f}% (%{text})<extra></extra>", cliponaxis: false }],
      { xaxis: { title: "success rate (%)", range: [0, 115] }, yaxis: { autorange: "reversed" }, margin: { l: 200, r: 20, t: 10, b: 48 },
        shapes: [{ type: "line", x0: 50, x1: 50, yref: "paper", y0: 0, y1: 1, line: { dash: "dash", color: css("--muted") } }], showlegend: false });
  });

  root.append(h("h2", {}, "The three studies"));
  const pcards = h("div", { class: "papers" });
  const cards = [
    ["p1a", "Paper 1a", "Carrier doping weakens metal–ligand bonds but does not predict phonon softening: an exact electronic/structural decomposition across eighteen two-dimensional carbides and carbide MXenes",
      "Five Ti₃C₂Tₓ MXenes, eight terminated M₂CTₓ and five bare M₂C carbides. The bonding rule depends on the bond type, not on the material family.",
      [`${A.systems.length} monolayers`, `${abCensus(A).shells} bond shells`, `${A.modes.length} optical modes`, "±0.2 e/f.u."]],
    ["p1b", "Paper 1b", "Gate-doped transition-metal dichalcogenide monolayers: a universal metal–chalcogen bonding rule that does not carry over to the phonons",
      "2H semiconductors, 1T semiconductors and 2H metals. In all 12 systems the bond follows the rule, but band filling drives 92% of the mode shifts in directions the bond does not predict.",
      [`${B.systems.length} monolayers`, `${abCensus(B).shells} bond shells`, `${B.modes.length} optical modes`, "jellium spill-out test"]],
    ["p2", "Paper 2", "Hole doping strengthens interlayer bonding yet softens the interlayer modes of transition-metal dichalcogenide bilayers",
      "MoX₂/WX₂ heterobilayers in 2H and 3R stacking and six AA′ homobilayers, at two vacuum widths. Holes strengthen the interlayer bond yet soften both the breathing and the shear mode; the pCOHP at the valence-band edge explains the bond side.",
      [`${C.pairs.length} bilayers`, "breathing + shear", "vacuum 20 Å and 30 Å", "doped-charge profiles"]],
  ];
  cards.forEach(([id, tag, ttl, txt, chips]) => {
    const c = h("div", { class: "card paper-card", tabindex: "0", role: "link" },
      `<span class="tag">${tag}</span><span class="ttl">${ttl}</span><p>${txt}</p><div class="chips">${chips.map(x => `<span class="chip">${x}</span>`).join("")}</div>`);
    c.onclick = () => showTab(id);
    c.onkeydown = e => { if (e.key === "Enter") showTab(id); };
    pcards.append(c);
  });
  root.append(pcards);
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

  allBondsBlock(root, P, cfg);

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

  modeTestBlock(root, P, cfg);

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


/* ---------- every bond (all_bonds.py) */
const shellLab = s => { const m = s.match(/^(.*)\((\d+)\)$/); return m ? `${m[1].replace("-", "–")}<sup>(${m[2]})</sup>` : s; };
const shellPlain = s => { const m = s.match(/^(.*)\((\d+)\)$/); return m ? `${m[1].replace("-", "–")} (${m[2]})` : s; };
function abCensus(P) {
  const c = { canonical: 0, anti: 0, same: 0, n: 0, shells: 0, contacts: 0 };
  Object.values(P.allbonds).forEach(v => v.bonds.forEach(b => {
    c.shells++;
    if (b.weak) { c.contacts++; return; }
    c.n++; if (b.dir) c[b.dir]++;
  }));
  return c;
}
function allBondsBlock(root, P, cfg) {
  const AB = P.allbonds, sys = Object.keys(AB), c = abCensus(P);
  const mostML = sys.filter(s => AB[s].bonds.find(b => b.shell === AB[s].most).dir === "canonical").length;
  root.append(h("h2", {}, "Every bond in every system"));
  const blk = block(root, "All bond shells computed by LOBSTER",
    `The tracked bonds above are a subset. Here every symmetry-distinct bond shell inside each system's LOBSTER range is listed: ${c.shells} shells in ${sys.length} systems.
    Shells with |ICOHP₀| &lt; 0.1 eV are weak contacts. They are shown in grey and left out of the census. Of the ${c.n} real bonds, <b>${c.canonical}</b> are canonical
    (weaker under e⁻, stronger under h⁺), <b>${c.anti}</b> anti and <b>${c.same}</b> change in the same direction under both carriers. The most affected bond is canonical in ${mostML} of ${sys.length} systems.
    In the plot and table, ★ marks the most affected bond and ☆ the least affected, judged by max(|Δ<sub>e</sub>|, |Δ<sub>h</sub>|) among real bonds.`);
  const st = { sys: sys.includes(cfg.defaultSys) ? cfg.defaultSys : sys[0], carrier: "both" };
  const p = plotDiv(blk.b);
  const rows = () => (st.sys === "all" ? sys : [st.sys]).flatMap(s => AB[s].bonds.map(b => ({ ...b, system: s, family: AB[s].family,
    tag: b.shell === AB[s].most ? "most" : b.shell === AB[s].least ? "least" : b.weak ? "contact" : "" })));
  blk.controls.append(
    select([["all", "All systems (table only)"], ...sys.map(s => [s, plain(s)])], st.sys, v => { st.sys = v; draw(); tb.update(rows()); }, "System"),
    seg([["both", "Total e⁻ / h⁺"], ["e", "e⁻ channels"], ["h", "h⁺ channels"]], "both", v => { st.carrier = v; draw(); }));
  function draw() {
    const s = st.sys === "all" ? sys[0] : st.sys, r = AB[s].bonds;
    const x = r.map(b => (b.shell === AB[s].most ? "★ " : b.shell === AB[s].least ? "☆ " : "") + shellPlain(b.shell) + ` · ${f(b.d, 2)} Å`);
    const op = r.map(b => b.weak ? .35 : 1);
    let tr;
    if (st.carrier === "both") {
      tr = [["e", "Electron doping", "--e"], ["h", "Hole doping", "--h"]].map(([k, n, v]) => ({ type: "bar", name: n, x, y: r.map(b => b[k] ? b[k].total : null),
        marker: { color: css(v), opacity: op }, customdata: r.map(b => [b.icohp0, b.dir || "–", b.n]),
        hovertemplate: "%{x}<br>ΔICOHP %{y:.4f} eV<br>ICOHP₀ %{customdata[0]:.3f} eV · %{customdata[1]} · n=%{customdata[2]}<extra>" + n + "</extra>" }));
    } else {
      const k = st.carrier;
      tr = [["elec", "Band filling", "--elec"], ["struct", "Structural", "--struct"]].map(([q, n, v]) => ({ type: "bar", name: n, x, y: r.map(b => b[k] ? b[k][q] : null),
        marker: { color: css(v), opacity: op }, hovertemplate: "%{x}<br>" + n + " %{y:.4f} eV<extra></extra>" }));
      tr.push({ type: "scatter", mode: "markers", name: "Total", x, y: r.map(b => b[k] ? b[k].total : null), marker: { symbol: "diamond", size: 8, color: css("--ink") },
        hovertemplate: "%{x}<br>total %{y:.4f} eV<extra></extra>" });
    }
    plot(p, tr, { barmode: st.carrier === "both" ? "group" : "relative", yaxis: { title: "ΔICOHP (eV per bond; + = weaker)" },
      xaxis: { tickangle: -45, tickfont: { size: 10 }, type: "category" }, margin: { l: 60, r: 10, t: 30, b: 120 },
      annotations: [{ xref: "paper", yref: "paper", x: 1, y: 1.08, xanchor: "right", showarrow: false, text: `${plain(s)} · faded bars are contacts`, font: { size: 11, color: css("--muted") } }] });
  }
  reg(draw);
  const d3 = (o, k) => o ? sgn(o[k], 4) : "–";
  const tb = table(blk.b, [
    { k: "system", t: "System", l: 1, fmt: v => chem(v) },
    { k: "shell", t: "Shell", l: 1, fmt: (v, r) => (r.tag === "most" ? "★ " : r.tag === "least" ? "☆ " : "") + shellLab(v) },
    { k: "d", t: "d (Å)", fmt: v => f(v, 3) }, { k: "dz", t: "|d<sub>z</sub>| (Å)", fmt: v => f(v, 2) }, { k: "n", t: "n" },
    { k: "icohp0", t: "ICOHP₀ (eV)", fmt: v => f(v, 3) },
    { k: "et", t: "Δ e⁻", get: r => r.e && r.e.total, fmt: (v, r) => d3(r.e, "total"), sort: r => r.e ? r.e.total : 0, cls: r => r.e && r.e.total > 0 ? "weak" : "strong" },
    { k: "ee", t: "e⁻ band fill", get: r => r.e && r.e.elec, fmt: (v, r) => d3(r.e, "elec"), sort: r => r.e ? r.e.elec : 0 },
    { k: "es", t: "e⁻ struct.", get: r => r.e && r.e.struct, fmt: (v, r) => d3(r.e, "struct"), sort: r => r.e ? r.e.struct : 0 },
    { k: "ht", t: "Δ h⁺", get: r => r.h && r.h.total, fmt: (v, r) => d3(r.h, "total"), sort: r => r.h ? r.h.total : 0, cls: r => r.h && r.h.total > 0 ? "weak" : "strong" },
    { k: "he", t: "h⁺ band fill", get: r => r.h && r.h.elec, fmt: (v, r) => d3(r.h, "elec"), sort: r => r.h ? r.h.elec : 0 },
    { k: "hs", t: "h⁺ struct.", get: r => r.h && r.h.struct, fmt: (v, r) => d3(r.h, "struct"), sort: r => r.h ? r.h.struct : 0 },
    { k: "dir", t: "Class", l: 1, fmt: (v, r) => r.weak ? `<span class="muted">contact</span>` : v ? `<span class="pill ${v}">${v}</span>` : "–" },
    { k: "absresp", t: "Response (eV)", fmt: v => f(v, 4) },
  ], rows(), r => r.tag);
}

/* ---------- mode-resolved bond-informed test (mode_bond_test.py) */
function modeTestBlock(root, P, cfg) {
  const M = P.modetest, groups = ["ALL", ...cfg.families.filter(x => M.summary[x])];
  const all = M.summary.ALL;
  const pct = o => 100 * o.follow / o.tested;
  const blk = block(root, "Mode-resolved test: does the bond change predict the phonon shift?",
    `Every bond enters, weighted by how much each mode stretches it. The prediction is P<sub>k</sub> = −Σ<sub>b</sub> s<sub>kb</sub> ΔICOHP<sub>b</sub>, where s<sub>kb</sub> is the
    squared stretch of bond shell b in the undoped eigenvector of mode k (averaged over degenerate modes). This assumes that a bond's stiffness change follows its ICOHP change.
    The test is applied to the total shift and to each channel separately. Over all ${all.total.tested} shifts the bond change predicts the <b>structural</b> channel
    (${f(pct(all.struct), 1)}%, p = ${all.struct.p}) but not the band-filling channel (${f(pct(all.elec), 1)}%) or the total (${f(pct(all.total), 1)}%). The dashed line marks chance (50%).`);
  const p = plotDiv(blk.b);
  reg(() => {
    const tr = [["total", "Total shift", "--ink-2"], ["elec", "Band filling", "--elec"], ["struct", "Structural", "--struct"]].map(([ch, n, v]) => ({
      type: "bar", name: n, x: groups.map(g => g === "ALL" ? "all systems" : g), y: groups.map(g => pct(M.summary[g][ch])),
      text: groups.map(g => `${M.summary[g][ch].follow}/${M.summary[g][ch].tested}`), textposition: "outside", cliponaxis: false,
      customdata: groups.map(g => [M.summary[g][ch].p, pct(M.summary[g][ch].rel), pct(M.summary[g][ch].strong)]), marker: { color: css(v) },
      hovertemplate: "%{x}: %{y:.1f}% (%{text})<br>p(>50%) = %{customdata[0]}<br>relative weighting %{customdata[1]:.1f}% · strong bonds only %{customdata[2]:.1f}%<extra>" + n + "</extra>" }));
    plot(p, tr, { barmode: "group", yaxis: { title: "shifts whose sign is predicted (%)", range: [0, 110] },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 50, y1: 50, line: { dash: "dash", color: css("--muted") } }] });
  });
  const srows = groups.flatMap(g => ["total", "elec", "struct"].map(ch => ({ g: g === "ALL" ? "all systems" : g, ch, ...M.summary[g][ch] })));
  const CH = { total: "total", elec: "band filling", struct: "structural" };
  table(blk.b, [
    { k: "g", t: "Group", l: 1 }, { k: "ch", t: "Channel", l: 1, fmt: v => CH[v] },
    { k: "follow", t: "Follow", fmt: (v, r) => `${v}/${r.tested}` }, { k: "pct", t: "%", get: r => pct(r), fmt: v => f(v, 1), sort: r => pct(r) },
    { k: "p", t: "p (>50%)", fmt: v => v === null ? "–" : v, sort: r => r.p === null ? 1 : +r.p },
    { k: "rel", t: "relative ΔI/|I₀| (%)", get: r => pct(r.rel), fmt: v => f(v, 1), sort: r => pct(r.rel) },
    { k: "strong", t: "strong bonds only (%)", get: r => pct(r.strong), fmt: v => f(v, 1), sort: r => pct(r.strong) },
  ], srows, r => r.g === "all systems" ? "most" : "");
  const sy = Object.entries(M.systems).map(([s, v]) => ({ system: s, ...v }));
  const fr = a => a[1] ? 100 * a[0] / a[1] : null;
  const fc = a => `${a[0]}/${a[1]}`;
  const dom = s => [...new Set(M.modes.filter(m => m.system === s).map(m => m.dom))].map(shellPlain).join(", ");
  table(blk.b, [
    { k: "system", t: "System", l: 1, fmt: v => chem(v) }, { k: "family", t: "Family", l: 1 },
    { k: "total", t: "Total", fmt: fc, sort: r => fr(r.total) }, { k: "tp", t: "%", get: r => fr(r.total), fmt: v => f(v, 0) },
    { k: "elec", t: "Band filling", fmt: fc, sort: r => fr(r.elec) }, { k: "ep", t: "%", get: r => fr(r.elec), fmt: v => f(v, 0) },
    { k: "struct", t: "Structural", fmt: fc, sort: r => fr(r.struct) }, { k: "sp", t: "%", get: r => fr(r.struct), fmt: v => f(v, 0) },
    { k: "dom", t: "Most-stretched shells", l: 1, get: r => dom(r.system) },
  ], sy);
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
const P2X = { S: "#d4a017", Se: "#2e8b57", Te: "#7d3c98" };
const P2STACK = { "2H": "2H heterobilayer", "3R": "3R heterobilayer", "AA'": "AA′ homobilayer" };
const p2chal = p => (p.match(/(Te|Se|S)2/) || [, "S"])[1];
const p2lab = p => plain(p.replace(/-3R$/, "")).replace("-", "/") + (p.endsWith("-3R") ? " (3R)" : "");
const p2html = p => chem(p.replace(/-3R$/, "")).replace("-", "/") + (p.endsWith("-3R") ? " (3R)" : "");
function p2style(p) {
  const C = D.paper2, st = C.stack[p];
  const dash = st === "2H" ? "solid" : st === "3R" ? "dash" : "dot";
  const symbol = st === "AA'" ? (p.startsWith("W") ? "diamond" : "square") : st === "3R" ? "triangle-up" : "circle";
  return { line: { color: P2X[p2chal(p)], dash }, marker: { size: 8, color: P2X[p2chal(p)], symbol } };
}
function p2rel(arr, p, v, q, key) {
  const a = arr.find(b => b.pair === p && b.vac === v && b.q === q), b = arr.find(b => b.pair === p && b.vac === v && b.q === "q0");
  return a && b ? 100 * (a[key] - b[key]) / Math.abs(b[key]) : null;
}
function p2Summary() {
  const C = D.paper2;
  let opp = 0, n = 0;
  C.pairs.forEach(p => {
    const ib = p2rel(C.bond, p, 20, "qh2", "icohp"), kb = p2rel(C.k, p, 20, "qh2", "k");
    if (ib === null || kb === null) return;
    n++;
    if (ib < 0 && kb < 0) opp++;          // ICOHP more negative (stronger) yet k smaller
  });
  return { opp, n };
}
function renderPaper2() {
  const root = $("#p2");
  const C = D.paper2, S = C.shear.rows;
  const F = { grp: "all", vac: 20 };
  const draws = [];
  const redraw = () => draws.forEach(fn => fn());
  const sel = () => C.pairs.filter(p => F.grp === "all" || C.stack[p] === F.grp);
  const nSt = s => C.pairs.filter(p => C.stack[p] === s).length;
  const rng = (a, d = 0) => `${f(Math.min(...a), d)} to ${f(Math.max(...a), d)}`;
  const hb = C.pairs.map(p => -p2rel(C.bond, p, 20, "qh2", "icohp"));
  const hk = C.pairs.map(p => p2rel(C.k, p, 20, "qh2", "k")), hs = C.pairs.map(p => p2rel(S, p, 20, "qh2", "k"));
  const vdep = C.pairs.flatMap(p => ["qh2", "qe2"].map(q => Math.abs(p2rel(C.k, p, 20, q, "k") - p2rel(C.k, p, 30, q, "k"))));
  const ch = C.charge.filter(c => c.vac === 20);
  const sp20 = ch.filter(c => c.q === "qe2").map(c => 100 * c.vacuum), sp30 = C.charge.filter(c => c.vac === 30 && c.q === "qe2").map(c => 100 * c.vacuum);
  const abRatio = Object.values(C.allbonds).map(r => Math.min(...r.filter(b => b.cls !== "weak").map(b => Math.abs(b.icohp))) / Math.max(...r.filter(b => b.cls === "weak").map(b => Math.abs(b.icohp))));
  const strong1 = Object.values(C.allbonds).filter(r => r.filter(b => b.cls !== "weak").length === 1 && r[0].cls === "canonical").length;

  root.innerHTML = `
    <h1>Paper 2 · Interlayer bonding in TMD bilayers</h1>
    <p class="lede">The low-frequency layer-breathing and shear Raman modes are the standard probes of interlayer coupling, and gate-induced
    shifts of these modes are usually read as changes in interlayer bond strength. This study tests that reading on ${C.pairs.length} bilayers:
    the ${nSt("2H")} heterobilayers MoX₂/WX₂ (X = S, Se, Te) in 2H stacking, the same three in 3R stacking, and the ${nSt("AA'")} AA′ homobilayers of
    MoS₂, WS₂, MoSe₂, WSe₂, MoTe₂ and WTe₂. Doping uses a compensating jellium background, and every doped calculation is repeated at 20 Å and 30 Å
    of vacuum so that results which depend on the background can be identified and set aside.</p>
    <div class="cards">
      <div class="card good"><div class="big">+${rng(hb)}%</div><div class="lab">interlayer bond strengthening under 0.2 e/cell hole doping (−ΔICOHP/|ICOHP₀|), all ${C.pairs.length} bilayers</div></div>
      <div class="card bad"><div class="big">${rng(hk)}%</div><div class="lab">change in the breathing force constant under the same hole doping</div></div>
      <div class="card bad"><div class="big">${rng(hs)}%</div><div class="lab">change in the shear force constant under the same hole doping</div></div>
      <div class="card"><div class="big">≤${f(Math.max(...vdep), 1)}%</div><div class="lab">vacuum dependence of Δk/k (20 vs 30 Å). Electrons spill ${rng(sp20)}% of their charge into a 20 Å vacuum and ${rng(sp30)}% into 30 Å.</div></div>
    </div>`;

  const bar = h("div", { class: "block" });
  const bc = h("div", { class: "controls" });
  bc.append(
    seg([["all", "All 12"], ["2H", "2H hetero"], ["3R", "3R hetero"], ["AA'", "AA′ homo"]], F.grp, v => { F.grp = v; redraw(); }),
    seg([[20, "Vacuum 20 Å"], [30, "Vacuum 30 Å"]], F.vac, v => { F.vac = +v; redraw(); }));
  bar.append(h("div", { class: "muted" }, "These filters apply to every plot below. Colour marks the chalcogen (S, Se, Te). Line style marks the stacking: solid 2H, dashed 3R, dotted AA′ (squares Mo, diamonds W)."), bc);
  root.append(bar);
  const p2reg = fn => { draws.push(fn); reg(fn); };
  const xn = { title: "doping (e per cell; − = holes)" };
  const curve = (arr, key, err) => sel().map(p => {
    const r = arr.filter(x => x.pair === p && x.vac === F.vac).sort((a, b) => a.n - b.n);
    return { type: "scatter", mode: "lines+markers", name: p2lab(p), x: r.map(x => x.n), y: r.map(x => x[key]), ...p2style(p),
      error_y: err ? { type: "data", array: r.map(x => x[err]), visible: true, color: P2X[p2chal(p)] } : undefined,
      hovertemplate: `${p2lab(p)} · vac ${F.vac} Å<br>n %{x:+.1f} e<br>%{y:.4f}<extra></extra>` };
  });

  /* ---- bond + breathing */
  const g = h("div", { class: "grid2" }); root.append(g);
  const a = block(g, "Interlayer chalcogen–chalcogen ICOHP",
    "Shortest interlayer X···X contacts at the frozen undoped geometry, per contact, at ±0.2 e/cell. A more negative value means a stronger bond.");
  const pa = plotDiv(a.b);
  p2reg(() => plot(pa, curve(C.bond, "icohp"), { xaxis: xn, yaxis: { title: "ICOHP per X···X contact (eV)" } }));
  const b = block(g, "Layer-breathing mode", "Rigid out-of-plane displacement of the top layer, fitted over 5 points (0, ±0.02, ±0.06 Å).");
  const bs = { q: "w" };
  b.controls.append(seg([["w", "ω (cm⁻¹)"], ["k", "k (eV/Å²)"]], "w", v => { bs.q = v; drawK(); }));
  const pb = plotDiv(b.b);
  const drawK = () => plot(pb, curve(C.k, bs.q, bs.q === "k" ? "kerr" : null), { xaxis: xn, yaxis: { title: bs.q === "w" ? "ω<sub>LB</sub> (cm⁻¹)" : "k<sub>LB</sub> (eV Å⁻²)" } });
  p2reg(drawK);

  /* ---- shear + bond-vs-mode */
  const g3 = h("div", { class: "grid2" }); root.append(g3);
  const e = block(g3, "Shear mode", "Rigid in-plane displacement of the top layer, same 5-point protocol. Holes soften the shear mode in every bilayer. Electrons stiffen it slightly in the homobilayers and soften it in the 3R heterobilayers.");
  const ss = { q: "w" };
  e.controls.append(seg([["w", "ω (cm⁻¹)"], ["k", "k (eV/Å²)"]], "w", v => { ss.q = v; drawS(); }));
  const pe = plotDiv(e.b);
  const drawS = () => plot(pe, curve(S, ss.q, ss.q === "k" ? "kerr" : null), { xaxis: xn, yaxis: { title: ss.q === "w" ? "ω<sub>S</sub> (cm⁻¹)" : "k<sub>S</sub> (eV Å⁻²)" } });
  p2reg(drawS);
  const c = block(g3, "Bond strength and mode stiffness move in opposite directions",
    "Relative change at the selected doping. Under hole doping the interlayer bond becomes stronger (positive) while both force constants fall (negative).");
  const cs = { q: "qh2" };
  c.controls.append(seg([["qh2", "Hole 0.2"], ["qh4", "Hole 0.4"], ["qe2", "Electron 0.2"], ["qe4", "Electron 0.4"]], "qh2", v => { cs.q = v; drawC(); }));
  const pc = plotDiv(c.b);
  function drawC() {
    const P = sel(), x = P.map(p2lab), hasB = C.bond.some(b => b.q === cs.q);
    const tr = [];
    if (hasB) tr.push({ type: "bar", name: "bond −ΔICOHP/|ICOHP₀|", x, y: P.map(p => -p2rel(C.bond, p, F.vac, cs.q, "icohp")), marker: { color: css("--ok") }, hovertemplate: "%{x}: %{y:+.1f}%<extra>bond</extra>" });
    tr.push({ type: "bar", name: "breathing Δk/k", x, y: P.map(p => p2rel(C.k, p, F.vac, cs.q, "k")), marker: { color: css("--bad") }, hovertemplate: "%{x}: %{y:+.2f}%<extra>breathing</extra>" });
    tr.push({ type: "bar", name: "shear Δk/k", x, y: P.map(p => p2rel(S, p, F.vac, cs.q, "k")), marker: { color: css("--struct") }, hovertemplate: "%{x}: %{y:+.2f}%<extra>shear</extra>" });
    plot(pc, tr, { barmode: "group", yaxis: { title: "relative change (%)" }, xaxis: { tickangle: -35 }, margin: { l: 56, r: 10, t: 30, b: 90 },
      annotations: hasB ? [] : [{ xref: "paper", yref: "paper", x: .5, y: 1.06, text: "ICOHP computed at ±0.2 e only", showarrow: false, font: { size: 11, color: css("--muted") } }] });
  }
  p2reg(drawC);

  /* ---- doped-charge location */
  const g4 = h("div", { class: "grid2" }); root.append(g4);
  const q1 = block(g4, "Where the doped charge goes",
    `Share of the added carrier on the bottom layer, the top layer and in the vacuum, from the planar-averaged density difference ρ<sub>q</sub>(z) − ρ<sub>0</sub>(z).
    Holes stay on the slab and split almost evenly between the layers, even in the heterobilayers. Electrons spill ${rng(sp20)}% into a 20 Å vacuum and ${rng(sp30)}% into 30 Å.`);
  const qs = { q: "qe2" };
  q1.controls.append(seg([["qe2", "Electron 0.2"], ["qh2", "Hole 0.2"]], "qe2", v => { qs.q = v; drawQ(); }));
  const pq = plotDiv(q1.b);
  function drawQ() {
    const P = sel(), r = P.map(p => C.charge.find(c => c.pair === p && c.vac === F.vac && c.q === qs.q));
    const tr = [["bottom", "bottom layer", "--accent"], ["top", "top layer", "--struct"], ["vacuum", "vacuum", "--bad"]].map(([k, n, v]) => ({
      type: "bar", name: n, x: P.map(p2lab), y: r.map(c => 100 * c[k]), marker: { color: css(v) },
      customdata: r.map(c => k === "bottom" ? c.bm : k === "top" ? c.tm : ""), hovertemplate: "%{x}<br>" + n + " %{customdata} %{y:.1f}%<extra></extra>" }));
    plot(pq, tr, { barmode: "stack", yaxis: { title: "share of doped charge (%)", range: [0, 100] }, xaxis: { tickangle: -35 }, margin: { l: 56, r: 10, t: 30, b: 90 } });
  }
  p2reg(drawQ);
  const q2 = block(g4, "Doped-charge profile Δρ(z)", "Planar average of the doped minus undoped density along the stacking axis, for one bilayer, both carriers and both vacuum widths (solid 20 Å, dotted 30 Å).");
  const zs = { p: C.pairs[0] };
  q2.controls.append(select(C.pairs.map(p => [p, p2lab(p)]), zs.p, v => { zs.p = v; drawZ(); }, "Bilayer"));
  const pz = plotDiv(q2.b);
  function drawZ() {
    const tr = [];
    [20, 30].forEach(v => [["qe2", "electrons", "--e"], ["qh2", "holes", "--h"]].forEach(([q, n, cv]) => {
      const c = C.charge.find(x => x.pair === zs.p && x.vac === v && x.q === q);
      if (!c) return;
      const dz = (c.z[1] - c.z[0]) / 3, mid = c.z[c.z.length - 1] / 2;   // profile is every 3rd planar bin; centre the slab at 0
      tr.push({ type: "scatter", mode: "lines", name: `${n} · ${v} Å`, x: c.z.map(z => z - mid), y: c.drho.map(d => d / dz),
        line: { color: css(cv), dash: v === 20 ? "solid" : "dot", width: 1.6 },
        hovertemplate: `${n} · vac ${v} Å<br>z %{x:.2f} Å<br>Δρ %{y:.4f} e/Å<extra></extra>` });
    }));
    plot(pz, tr, { xaxis: { title: "z − cell centre (Å)" }, yaxis: { title: "Δρ(z) (e per Å, per cell)", zeroline: true } });
  }
  reg(drawZ);

  /* ---- interlayer all-bonds */
  const ab = block(root, "Every interlayer contact up to 5.8 Å",
    `LOBSTER was run for every interlayer atom pair within 5.8 Å. In ${strong1} of ${C.pairs.length} bilayers exactly one shell has |ICOHP₀| ≥ 0.01 eV: the shortest X···X contact, and it is canonical
    (weakened by electrons, strengthened by holes). Every other contact is ${f(Math.min(...abRatio), 0)} to ${f(Math.max(...abRatio), 0)} times weaker and is greyed out. Δ values are at ±0.2 e/cell and 20 Å vacuum.`);
  const abRows = () => sel().flatMap(p => C.allbonds[p].map(b => ({ ...b, system: p, stack: C.stack[p] })));
  const tAB = table(ab.b, [
    { k: "system", t: "Bilayer", l: 1, fmt: v => p2html(v) }, { k: "stack", t: "Stacking", l: 1 },
    { k: "pair", t: "Pair", l: 1, fmt: v => v.replace("-", "···") }, { k: "d", t: "d (Å)", fmt: v => f(v, 3) }, { k: "n", t: "n" },
    { k: "icohp", t: "ICOHP₀ (eV)", fmt: v => f(v, 4) },
    { k: "de", t: "Δ e⁻ (eV)", fmt: v => sgn(v, 4), cls: r => r.de > 0 ? "weak" : "strong" },
    { k: "dh", t: "Δ h⁺ (eV)", fmt: v => sgn(v, 4), cls: r => r.dh > 0 ? "weak" : "strong" },
    { k: "cls", t: "Class", l: 1, fmt: v => v === "weak" ? `<span class="muted">contact</span>` : `<span class="pill ${v}">${v}</span>` },
  ], abRows(), r => r.cls === "weak" ? "contact" : "most");
  draws.push(() => tAB.update(abRows()));

  /* ---- intralayer all-bonds */
  const ib = block(root, "Every bond inside the layers",
    `Every intralayer atom pair within 5.8 Å, grouped into shells. The metal–chalcogen bond is canonical in both layers of every bilayer and has the largest absolute response
    (0.10–0.18 eV per bond under electrons). Metal–metal and the vertical X–X pair across the metal plane respond the other way (anti, or holes only where the electron change is unresolved). A change below the 0.0036 eV resolution
    threshold is not given a sign; shells with |ICOHP₀| &lt; 0.1 eV are greyed out. Electron values depend on the vacuum width (switch above); hole values do not.`);
  const ibRows = () => sel().flatMap(p => C.intra.filter(b => b.system === p && b.vac === F.vac).map(b => ({ ...b, stack: C.stack[p] })));
  const tIB = table(ib.b, [
    { k: "system", t: "Bilayer", l: 1, fmt: v => p2html(v) }, { k: "stack", t: "Stacking", l: 1 },
    { k: "layer", t: "Layer", l: 1, fmt: v => v.replace(/(\d)/g, "<sub>$1</sub>") },
    { k: "pair", t: "Pair", l: 1, fmt: v => v.replace("-", "–") }, { k: "d", t: "d (Å)", fmt: v => f(v, 3) }, { k: "n", t: "n" },
    { k: "icohp", t: "ICOHP₀ (eV)", fmt: v => f(v, 4) },
    { k: "de", t: "Δ e⁻ (eV)", fmt: v => sgn(v, 4), cls: r => r.de > 0 ? "weak" : "strong" },
    { k: "dh", t: "Δ h⁺ (eV)", fmt: v => sgn(v, 4), cls: r => r.dh > 0 ? "weak" : "strong" },
    { k: "rel_e", t: "e⁻ (%)", fmt: v => sgn(v, 1) }, { k: "rel_h", t: "h⁺ (%)", fmt: v => sgn(v, 1) },
    { k: "cls", t: "Class", l: 1, fmt: v => v === "weak" ? `<span class="muted">weak</span>` : ["canonical", "anti", "same"].includes(v) ? `<span class="pill ${v}">${v}</span>` : `<span class="muted">${v}</span>` },
  ], ibRows(), r => r.cls === "weak" ? "contact" : "most");
  draws.push(() => tIB.update(ibRows()));

  /* ---- pCOHP at the band edge */
  const pk = block(root, "Why holes strengthen the interlayer bond: pCOHP at the valence-band edge",
    `−COHP(E) of the interlayer X···X contact for the undoped bilayer, with energies relative to the valence-band maximum. Negative values are antibonding.
    The top of the valence band is antibonding in every bilayer and is dominated by the p<sub>z</sub>–p<sub>z</sub> overlap, so removing electrons from it (holes) strengthens the contact.`);
  const ks = { orb: "mcohp" };
  pk.controls.append(seg([["mcohp", "All orbitals"], ["mcohp_pz", "p<sub>z</sub>–p<sub>z</sub> only"]], "mcohp", v => { ks.orb = v; drawP(); }));
  const pp = plotDiv(pk.b, "plot tall");
  function drawP() {
    const tr = sel().map(p => { const c = C.pcohp[`${p}_vac${F.vac}`]; if (!c) return null;
      return { type: "scatter", mode: "lines", name: p2lab(p), x: c.E, y: c[ks.orb], line: { ...p2style(p).line, width: 1.6 },
        hovertemplate: `${p2lab(p)}<br>E − E<sub>VBM</sub> %{x:.2f} eV<br>−COHP %{y:.4f}<extra></extra>` }; }).filter(Boolean);
    plot(pp, tr, { xaxis: { title: "E − E<sub>VBM</sub> (eV)", zeroline: false }, yaxis: { title: "−COHP (bonding > 0)", zeroline: true },
      shapes: [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1, line: { dash: "dash", color: css("--muted") } }] });
  }
  p2reg(drawP);
  const pkRows = () => sel().map(p => ({ system: p, stack: C.stack[p], ...C.pcohp[`${p}_vac${F.vac}`] })).filter(r => r.E);
  const tPK = table(pk.b, [
    { k: "system", t: "Bilayer", l: 1, fmt: v => p2html(v) }, { k: "stack", t: "Stacking", l: 1 },
    { k: "gap", t: "gap (eV)", fmt: v => f(v, 3) },
    { k: "edge", t: "edge −ICOHP, top 0.2 eV", fmt: v => sgn(v, 4), cls: r => r.edge < 0 ? "weak" : "strong" },
    { k: "edge_pz", t: "p<sub>z</sub>–p<sub>z</sub> part", fmt: v => sgn(v, 4) },
    { k: "i0", t: "ICOHP q0", get: r => r.icohp.q0, fmt: v => f(v, 4) },
    { k: "ih", t: "ICOHP h⁺ 0.2", get: r => r.icohp.qh2, fmt: v => f(v, 4) },
    { k: "ie", t: "ICOHP e⁻ 0.2", get: r => r.icohp.qe2, fmt: v => f(v, 4) },
  ], pkRows());
  draws.push(() => tPK.update(pkRows()));

  /* ---- binding curves + full table */
  const d = block(root, "Why vacuum width matters: MoS₂/WS₂ binding curves",
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

  const t = block(root, "All interlayer force constants", "Every breathing and shear fit, both vacuum widths. Click a column header to sort.");
  const kr = C.k.map(r => { const s = S.find(x => x.pair === r.pair && x.vac === r.vac && x.q === r.q) || {};
    return { pair: r.pair, stack: C.stack[r.pair], vac: r.vac, n: r.n, k: r.k, kerr: r.kerr, w: r.w, ks: s.k, kserr: s.kerr, ws: s.w }; });
  table(t.b, [
    { k: "pair", t: "Bilayer", l: 1, fmt: v => p2html(v) }, { k: "stack", t: "Stacking", l: 1 }, { k: "vac", t: "Vacuum (Å)" }, { k: "n", t: "Doping (e/cell)", fmt: v => sgn(v, 1) },
    { k: "k", t: "k<sub>LB</sub> (eV/Å²)", fmt: v => f(v, 4) }, { k: "kerr", t: "± fit", fmt: v => f(v, 4) }, { k: "w", t: "ω<sub>LB</sub> (cm⁻¹)", fmt: v => f(v, 2) },
    { k: "ks", t: "k<sub>S</sub> (eV/Å²)", fmt: v => f(v, 4) }, { k: "kserr", t: "± fit", fmt: v => f(v, 4) }, { k: "ws", t: "ω<sub>S</sub> (cm⁻¹)", fmt: v => f(v, 2) },
  ], kr);

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
      <dt>Bond shells</dt><dd>Every symmetry-distinct bond inside the LOBSTER range, grouped by atom pair and distance (Mo–S<sup>(1)</sup>, Mo–S<sup>(2)</sup>, …). Shells with |ICOHP₀| &lt; 0.1 eV (monolayers) or &lt; 0.01 eV (interlayer) are listed as weak contacts. The most and least affected bonds are ranked by max(|Δ<sub>e</sub>|, |Δ<sub>h</sub>|).</dd>
      <dt>Mode-resolved test</dt><dd>For each mode k the prediction is P<sub>k</sub> = −Σ<sub>b</sub> s<sub>kb</sub> ΔICOHP<sub>b</sub>, with s<sub>kb</sub> the squared stretch of shell b in the undoped eigenvector (degenerate modes averaged). A shift "follows" if its sign matches P<sub>k</sub>. It is tested for the total, band-filling and structural shifts, with two robustness variants: relative changes ΔICOHP/|ICOHP₀| and strong bonds only.</dd>
      <dt>Breathing force constant</dt><dd>Rigid top-layer displacement δ ∈ {0, ±0.02, ±0.06} Å with a quadratic fit of the net force, k = −dF/dδ. ω = (1/2πc)√(k/μ), where μ is the reduced layer mass.</dd>
      <dt>Shear force constant</dt><dd>The same protocol with the top layer displaced rigidly in-plane.</dd>
      <dt>pCOHP band edge</dt><dd>−COHP(E) of the shortest interlayer X···X contact, relative to the valence-band maximum. The edge value integrates it over the top 0.2 eV of the valence band; a negative value means those states are antibonding, so removing them (hole doping) strengthens the contact.</dd>
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
      because the metal–metal band-filling channel reverses sign under hole doping. Weighting every bond by how much each mode stretches it, the bond changes predict the sign of the total phonon shift for only ${f(100 * D.paper1a.modetest.summary.ALL.total.follow / D.paper1a.modetest.summary.ALL.total.tested, 0)}% of shifts,
      but the structural channel for ${f(100 * D.paper1a.modetest.summary.ALL.struct.follow / D.paper1a.modetest.summary.ALL.struct.tested, 0)}%.</div>`,
  });
  renderMaterials($("#p1b"), D.paper1b, {
    figs: "paper1b", families: ["2H-sc", "1T-sc", "2H-metal"], famVar: ["--accent", "--struct", "--h"],
    threewayKeys: [["all", "all"], ["2H-sc", "2H semicond."], ["1T-sc", "1T semicond."], ["2H-metal", "2H metals"]], defaultSys: "MoS2", defaultQ: "w:A1'",
    extra: spillBlocks,
    intro: `<h1>Paper 1b · Transition-metal dichalcogenide monolayers</h1>
      <p class="lede">The study covers twelve monolayers in three electronic classes: trigonal-prismatic semiconductors (Mo, W)(S, Se, Te)₂, octahedral semiconductors
      PtS₂, PtSe₂, HfS₂ and ZrS₂, and the trigonal-prismatic metals NbSe₂ and TaS₂.</p>
      <div class="callout">The metal–chalcogen bond obeys the rule in all 12 systems, and band filling has the canonical sign in all 24 cases. Band filling also
      dominates 92% of mode shifts, yet the stretch-weighted bond changes predict the sign of only ${f(100 * D.paper1b.modetest.summary.ALL.total.follow / D.paper1b.modetest.summary.ALL.total.tested, 0)}% of the total shifts
      (${f(100 * D.paper1b.modetest.summary.ALL.struct.follow / D.paper1b.modetest.summary.ALL.struct.tested, 0)}% of the structural ones). Hole doping strengthens the bond while lowering its stiffness in all 8 systems tested.</div>`,
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
