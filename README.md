# Gate-Doping Results Explorer

This is an interactive website with the results of three first-principles studies of carrier doping, chemical bonding and lattice dynamics in two-dimensional materials. The studies are by Md Faiz Akhtar, Vardhman Dwivedi and Somnath Bhowmick, Department of Materials Science and Engineering, IIT Kanpur.

- **Paper 1a:** carrier doping weakens metal–ligand bonds but does not predict phonon softening. It covers 18 carbides and carbide MXenes.
- **Paper 1b:** gate-doped transition-metal dichalcogenide monolayers. The metal–chalcogen bonding rule is universal, but it does not carry over to the phonons. It covers 12 TMDs.
- **Paper 2:** in TMD bilayers, hole doping strengthens interlayer bonding yet softens the layer-breathing and shear modes. It covers 12 bilayers: MoX2/WX2 (X = S, Se, Te) in 2H and 3R stacking, and six AA′ homobilayers.

For Papers 1a and 1b, every symmetry-distinct bond shell computed by LOBSTER is listed (not only the tracked bonds), together with a mode-resolved test of whether the stretch-weighted bond changes predict each phonon shift. Paper 2 also shows where the doped charge sits (layer and vacuum fractions, Δρ(z) profiles), every interlayer contact up to 5.8 Å, and the pCOHP at the valence-band edge.

The site is fully static: `index.html`, `app.js` and `style.css`. Plotly is loaded from a CDN. All numbers come from `data/results.json`, and the manuscript figures are in `figs/`.

## Updating

`build_data.py` regenerates `data/results.json` and copies the figures from the analysis tree of the research project. Run it, then commit and push:

```bash
python3 build_data.py
git add build_data.py app.js style.css data/results.json figs/ && git commit -m "update results" && git push
```

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

The manuscripts are in preparation. Please cite the published versions once they appear.
