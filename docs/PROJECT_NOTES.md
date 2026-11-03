# Project notes (user preferences for JV Analyzer)

## Inspect charts
- Current-density plots show positive photovoltaic curves falling toward zero with increasing voltage, with minor ticks.
- All pixels shown together by default, with an all-pixels on/off switch.
- Chart toolbar hidden in normal charts; shown only in enlarged charts.
- Pixel selection is a toggle strip below the file list, never an in-chart legend.
- I–V/J–V charts are Origin-style for publishing: thick black box, inward ticks on all sides, Arial bold titles, white paper.
- Forward and reverse of one pixel share one colour; forward dashed, reverse solid.
- Chart legend says only Forward / Reverse / Scan — the pixel name is dropped because the side panel already picks it; pixel names reappear only when several pixels are drawn together, where they are the only thing telling the curves apart.
- Grid lines behind a switch, off by default; major lines visible, minor lines much fainter.
- Voltage gridlines sit every 0.05 V (three faint lines between each labelled tick); current axes keep their automatic spacing.
- "Compare two files" switch overlays I–V and J–V of two samples, coloured by sample.

## Parameter Calculation charts
- Original forward/reverse box plots with individual points and mean markers (not bars).

## Plot labels and exports
- Every y-axis is labelled with its parameter (and unit).
- Image downloads are named parameter_filename (e.g. pce_filename.png).

## Repo sync
- Repo holds src/, backend/, streamlit_frontend/ (built UI), streamlit_app.py, requirements.txt, plus AGENTS.md, roadmap.md, docs/.
- No .gitignore, package.json, vite/ts config, index.html or __pycache__.
- Rebuild the UI from src/ into streamlit_frontend/ (Vite, base './') before each sync.
