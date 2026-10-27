#!/usr/bin/env python3
"""Collect the published results of Paper 1a, Paper 1b and Paper 2 into one
compact JSON file (data/results.json) for the static results explorer.

Every number is copied from the analysis outputs on disk; nothing is
recomputed here. Run from this directory:  python3 build_data.py
"""
import os, json, shutil, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
A = os.path.join(ROOT, "proposal/analysis_report/data")
P = os.path.join(ROOT, "proposal/analysis_report/paper")
T = os.path.join(ROOT, "vasp_lobster_TMD1b")
H = os.path.join(ROOT, "hetero_paper2")
OUT = os.path.join(os.path.dirname(__file__), "data")


def load(*p):
    return json.load(open(os.path.join(*p)))


def r(x, n=5):
    if isinstance(x, float):
        return round(x, n)
    if isinstance(x, list):
        return [r(v, n) for v in x]
    if isinstance(x, dict):
        return {k: r(v, n) for k, v in x.items()}
    return x


def chan(d):
    return {k: d[k] for k in ("total", "elec", "struct", "cross")}


def bond_rows(rows, family_of):
    out = []
    for b in rows:
        out.append({"system": b["system"], "family": family_of(b["system"]),
                    "bond": b["bond"], "mult": b["mult"], "icohp0": b["undoped"],
                    "e": chan(b["e"]), "h": chan(b["h"]),
                    "follows": b["follows_rule"]})
    return out


def mode_rows(shift, family_of, labels=None):
    """Per system and optical mode: e and h shifts with the exact
    band-filling / structural / cross decomposition."""
    out = []
    for s, v in shift.items():
        e, h = v["e"], v["h"]
        for i, me in enumerate(e):
            mh = h[i] if h else None
            if mh is not None:
                assert abs(me["w0"] - mh["w0"]) < 1e-6, (s, i)
            lab = labels(s, me["w0"]) if labels else None
            out.append({"system": s, "family": family_of(s), "i": i,
                        "w0": me["w0"], "sym": lab,
                        "e": chan(me), "h": chan(mh) if mh else None})
    return out


def series(ds, sysname):
    a = ds["analysis"][sysname]["quantities"]
    q = {}
    for k, v in a.items():
        if not isinstance(v, dict) or "values" not in v:
            continue
        q[k] = {"values": v["values"],
                "alpha3": v.get("alpha3"), "beta3": v.get("beta3")}
    return {"n": ds["n"], "q": q}


# ---------------------------------------------------------------- Paper 1a
FAM1A = {"part1": "Ti₃C₂Tₓ MXene", "part3": "terminated M₂CTₓ",
         "part4": "bare M₂C"}
ps = load(A, "1a/paper_stats.json")
fam = {}
for p in ("part1", "part3", "part4"):
    for row in ps["lattice"][p]:
        fam[row["system"]] = FAM1A[p]
lat1a = []
for p in ("part1", "part3", "part4"):
    for row in ps["lattice"][p]:
        sp = ps["spilling"][p].get(row["system"], {})
        lat1a.append({"system": row["system"], "family": FAM1A[p],
                      "a0": row["a0"], "de_pct": row["de_pct"],
                      "dh_pct": row["dh_pct"],
                      "spill": sp.get("full_undoped")})
bonds1a = bond_rows(sum((ps["bonds"][p] for p in ("part1", "part3", "part4")), []),
                    lambda s: fam[s])
ab1a = load(A, "1a/alpha_beta.json")
METALS = {"Ti", "V", "Nb", "Mo", "Sc", "W", "Hf", "Zr", "Ta", "Pt", "M"}


def bondkind(bond):
    """M-M / M-X / X-X from the element names (generic "M-C" style included);
    O-H is classed M-X, as in the original alpha_beta records"""
    a, b = bond.split("(")[0].split("-")
    if {a, b} == {"O", "H"}:
        return "M-X"
    return {2: "M-M", 1: "M-X", 0: "X-X"}[(a in METALS) + (b in METALS)]


# alpha_beta.json may key bonds by pair ("C-Ti") or by shell ("C-Ti(1)"); all
# shells of one pair share the same kind
kind = {}
for b in ab1a["bond_records"]:
    kind[(b["system"], b["bond"])] = b["kind"]
    kind.setdefault((b["system"], b["bond"].split("(")[0]), b["kind"])
# paper_stats stores the bond length, not the multiplicity, in "mult" for the
# terminated carbides; take [icohp, dist, mult] from m2c_terminated instead
term = load(A, "m2c_terminated.json")["D"]
for b in bonds1a:
    b["kind"] = kind.get((b["system"], b["bond"])) or bondkind(b["bond"])
    if b["system"] in term:
        b["mult"] = term[b["system"]]["full_undoped"]["icohp"][b["bond"]][2]
shift1a = {}
shift1a.update(load(A, "results.json")["shift"])
shift1a.update(load(A, "m2c_terminated.json")["shift"])
shift1a.update(load(A, "m2c_full.json")["shift"])
shift1a = {s: v for s, v in shift1a.items() if s in fam}
modes1a = mode_rows(shift1a, lambda s: fam[s])
freqs1a = {}
for p in ("part1", "part3", "part4"):
    freqs1a.update(ps["freqs"][p])
hess = load(A, "1a/hessian_bonds.json")
stiff1a = [{k: b.get(k) for k in ("system", "bond", "dist", "k0", "icohp0",
                                  "dk_e", "dk_rel_e", "dicohp_e",
                                  "dk_h", "dk_rel_h", "dicohp_h")}
           for b in hess["bonds"]]
boot = load(A, "1a/bootstrap_stats.json")
ds = load(A, "doping_series.json")
paper1a = {
    "systems": lat1a, "bonds": bonds1a, "modes": modes1a, "freqs": freqs1a,
    "threeway": ps["threeway"], "mode_stats": {
        p: {k: v for k, v in ps["modes"][p].items() if k != "per_system"}
        for p in ps["modes"]},
    "alpha_beta": {"modes": ab1a["mode_records"], "bonds": ab1a["bond_records"],
                   "lattice": ab1a["lattice_records"]},
    "stiffness": stiff1a, "stiffness_stats": hess["stats"],
    "bootstrap": boot,
    "series": {s: series(ds, s) for s in ("Sc2C", "Ti2C", "V2C", "Nb2C", "Mo2C")},
    "families": FAM1A,
}

# ---------------------------------------------------------------- Paper 1b
D1B = os.path.join(T, "analysis/data")
st = load(D1B, "stats_1b.json")
res1b = load(D1B, "results.json")
sym = load(D1B, "final.json")["sym"]
cls = st["class"]


def lab1b(s, w0):
    best = min(sym[s], key=lambda t: abs(t[1] - w0))
    return best[0] if abs(best[1] - w0) < 1e-3 else None


lat1b = [{"system": row["system"], "family": cls[row["system"]],
          "a0": row["a0"], "de_pct": row["de_pct"], "dh_pct": row["dh_pct"],
          "spill": res1b["D"][row["system"]]["full_undoped"].get("spill")}
         for row in st["lattice"]]
spill_tmd = load(T, "spill_test/spill_tmd.json")
spill_n = load(T, "spill_test/spill_n_mos2.json")
stf = load(D1B, "stiffness_1b.json")
paper1b = {
    "order": st["order"], "systems": lat1b, "cutoffs": st["cutoffs"],
    "bonds": [dict(b, kind="M-X") for b in bond_rows(st["bonds"], lambda s: cls[s])],
    "modes": mode_rows(res1b["shift"], lambda s: cls[s], lab1b),
    "freqs": {s: res1b["D"][s]["full_undoped"]["freq"] for s in st["order"]},
    "threeway": st["threeway"], "significance": st["significance"],
    "mode_stats": {k: {kk: vv for kk, vv in v.items() if kk != "per_system"}
                   for k, v in st["modes"].items()},
    "alpha_beta": st["alpha_beta"],
    "stiffness": stf["bonds"],
    "spill": spill_tmd, "spill_n_mos2": spill_n,
    "series": {"MoS2": series(ds, "MoS2")},
}

# ---------------------------------------------------------------- Paper 2
S5 = load(H, "stage5_rudra/stage5.json")
num = load(P, "paper2/figs/paper2_numbers.json")
DOP = {"qh4": -0.4, "qh2": -0.2, "q0": 0.0, "qe2": 0.2, "qe4": 0.4}
k2 = []
for key, k in num["k"].items():
    pair, vac, q = key.split("|")
    k2.append({"pair": pair, "vac": int(vac[3:]), "q": q, "n": DOP[q],
               "k": k, "kerr": num["kerr"][key], "w": num["w"][key]})
bond2 = []
for key, v in S5["bond"].items():
    pair, vac = key.rsplit("_", 1)
    for q, b in v.items():
        bond2.append({"pair": pair, "vac": int(vac[3:]), "q": q, "n": DOP[q],
                      "contact": b["contact"], "icohp": b["icohp"],
                      "nbond": b["n"], "spill": b["spill"]})
paper2 = {"pairs": ["MoS2-WS2", "MoSe2-WSe2", "MoTe2-WTe2"],
          "k": k2, "bond": bond2, "bind": S5["bind"], "relax": S5["relax"],
          "floor": 0.0036, "shear": None}
shear = os.path.join(H, "stage6_shear/shear.json")
if os.path.exists(shear):
    paper2["shear"] = load(shear)

# ---------------------------------------------------------------- all bonds (1a, 1b)
# every symmetry-distinct bond shell LOBSTER computed (all_bonds.py) and the
# mode-resolved, stretch-weighted bond-informed sign test (mode_bond_test.py)
FAMNAME = {"Ti3C2Tx MXene": "Ti₃C₂Tₓ MXene", "terminated M2CTx": "terminated M₂CTₓ",
           "bare M2C": "bare M₂C", "2H semiconductor": "2H-sc",
           "1T semiconductor": "1T-sc", "2H metal": "2H-metal"}
AB = load(A, "all_bonds/all_bonds.json")
MT = load(A, "all_bonds/mode_bond_test.json")


def sub3(d):
    return None if d is None else {k: d[k] for k in ("total", "elec", "struct")}


def allbonds(paper):
    out = {}
    for s, v in AB.items():
        if v["paper"] != paper:
            continue
        out[s] = {"family": FAMNAME[v["family"]], "most": v["most_affected"],
                  "least": v["least_affected"],
                  "bonds": [{"shell": b["shell"], "pair": b["pair"], "d": b["d"], "dz": b["dz"],
                             "n": b["n"], "icohp0": b["full_undoped"], "e": sub3(b["de"]),
                             "h": sub3(b["dh"]), "dir": b["direction"],
                             "weak": b["weak_contact"], "resp": b["response"],
                             "absresp": b["abs_response"]} for b in v["bonds"]]}
    return out


def modetest(paper):
    summ = {}
    for g, v in MT["summary"].items():
        pp, fam = [x.strip() for x in g.split("|")]
        if pp != paper:
            continue
        # p-values as strings: the global 5-decimal rounding would zero them
        for c in v.values():
            for o in (c, c["rel"], c["strong"]):
                o["p"] = None if o["p"] is None else "%.2g" % o["p"]
        summ[fam if fam == "ALL" else FAMNAME[fam]] = v
    systems, modes = {}, []
    for s, v in MT["systems"].items():
        if v["paper"] != paper:
            continue
        rec = {"family": FAMNAME[v["family"]]}
        for ch in ("total", "elec", "struct"):
            st = [m[ch]["status"] for m in v["modes"]]
            rec[ch] = [st.count("follow"), st.count("follow") + st.count("violate")]
        systems[s] = rec
        for m in v["modes"]:
            modes.append({"system": s, "carrier": m["carrier"], "w0": m["w0"],
                          "dom": m["dominant_bond"], "share": m["dominant_share"],
                          **{ch: {"pred": m[ch]["pred"], "obs": m[ch]["obs"], "st": m[ch]["status"]}
                             for ch in ("total", "elec", "struct")}})
    return {"summary": summ, "systems": systems, "modes": modes}


for paper, P_ in (("1a", paper1a), ("1b", paper1b)):
    P_["allbonds"] = allbonds(paper)
    P_["modetest"] = modetest(paper)

# ---------------------------------------------------------------- Paper 2, stage 7
# twelve bilayers: the three 2H heterobilayers (stage 5/6) plus three 3R
# heterobilayers and six AA' homobilayers (stage 7, Rudra 98519)
S7 = load(H, "stage7_extend/stage7.json")
PC7 = load(H, "stage7_extend/pcohp.json")
H2H = ["MoS2-WS2", "MoSe2-WSe2", "MoTe2-WTe2"]
R3 = ["MoS2-WS2-3R", "MoSe2-WSe2-3R", "MoTe2-WTe2-3R"]
HOMO = [m + x + "2-" + m + x + "2" for x in ("S", "Se", "Te") for m in ("Mo", "W")]
STACK = {**{s: "2H" for s in H2H}, **{s: "3R" for s in R3}, **{s: "AA'" for s in HOMO}}
paper2["pairs"] = H2H + R3 + HOMO
paper2["stack"] = STACK
for row in k2:
    row["stack"] = "2H"
for key, v in S7["k"].items():
    s, vac, q = key.rsplit("_", 2)
    k2.append({"pair": s, "vac": int(vac[3:]), "q": q, "n": DOP[q], "k": v["k"],
               "kerr": v["kerr"], "w": v["w"], "stack": STACK[s]})
for key, v in S7["bond"].items():
    s, vac = key.rsplit("_", 1)
    if s in H2H:
        continue                       # stage-5 rows already present (reproduced exactly)
    for q, d in (("qh2", v["dh"]), ("q0", 0.0), ("qe2", v["de"])):
        sp = {"qh2": v["spill_h"], "q0": v["spill"], "qe2": v["spill_e"]}[q]
        bond2.append({"pair": s, "vac": int(vac[3:]), "q": q, "n": DOP[q],
                      "contact": v["contact"], "icohp": v["icohp"] + d,
                      "nbond": v["n"], "spill": sp})
shear_rows = []
SH = paper2.pop("shear") or {}
for key, v in list(SH.items()) + list(S7["s"].items()):
    s, vac, q = key.rsplit("_", 2)
    shear_rows.append({"pair": s, "vac": int(vac[3:]), "q": q, "n": DOP[q], "k": v["k"],
                       "kerr": v["kerr"], "w": v["w"], "stack": STACK[s]})
paper2["shear"] = {"rows": shear_rows}
paper2["relax7"] = S7["relax"]
paper2["allbonds"] = S7["allbonds"]
# every intralayer shell (stage 8, job 103968); class needs both changes above
# the 0.0036 eV resolution threshold, otherwise only the resolved side is named
IN8 = load(H, "stage8_intra/intra.json")["systems"]


def intra_cls(b):
    if b["weak"]:
        return "weak"
    rh, re_ = abs(b["dh"]) >= 0.0036, abs(b["de"]) >= 0.0036
    if rh and re_:
        return "canonical" if b["dh"] < 0 < b["de"] else ("anti" if b["dh"] > 0 > b["de"] else "same")
    return "holes only" if rh else ("electrons only" if re_ else "n.r.")


paper2["intra"] = [dict(b, system=s, vac=int(vac[3:]), cls=intra_cls(b))
                   for s, V in IN8.items() for vac, rows in V.items() for b in rows]
paper2["charge"] = []
for key, v in S7["charge"].items():
    s, vac, q = key.rsplit("_", 2)
    paper2["charge"].append({"pair": s, "vac": int(vac[3:]), "q": q, "n": DOP[q],
                             "bottom": v["bottom"], "top": v["top"], "vacuum": v["vacuum"],
                             "bm": v["bottom_metal"], "tm": v["top_metal"],
                             "z": v["profile_z"], "drho": v["profile"]})
paper2["pcohp"] = {}
for s, V in PC7.items():
    for vac, Q in V.items():
        z = Q["q0"]
        paper2["pcohp"]["%s_%s" % (s, vac)] = {
            "gap": z["gap"], "edge": z["edge_int"], "edge_pz": z["edge_int_pz"],
            "E": z["E"], "mcohp": z["mcohp"], "mcohp_pz": z["mcohp_pz"],
            "icohp": {q: Q[q]["icohp"] for q in Q}}

# ---------------------------------------------------------------- figures
figs = {}
for p in ("paper1a", "paper1b", "paper2"):
    dst = os.path.join(os.path.dirname(__file__), "figs", p)
    os.makedirs(dst, exist_ok=True)
    names = []
    for f in sorted(glob.glob(os.path.join(P, p, "figs", "*.png"))):
        shutil.copy2(f, dst)
        names.append(os.path.basename(f))
    figs[p] = names

os.makedirs(OUT, exist_ok=True)
data = r({"paper1a": paper1a, "paper1b": paper1b, "paper2": paper2,
          "figs": figs})
with open(os.path.join(OUT, "results.json"), "w") as fh:
    json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
print("wrote", os.path.join(OUT, "results.json"),
      os.path.getsize(os.path.join(OUT, "results.json")) // 1024, "KiB")
print("1a: %d systems %d bonds %d modes | 1b: %d systems %d bonds %d modes | "
      "2: %d k rows %d bond rows" % (len(lat1a), len(bonds1a), len(modes1a),
                                    len(lat1b), len(paper1b["bonds"]),
                                    len(paper1b["modes"]), len(k2), len(bond2)))
