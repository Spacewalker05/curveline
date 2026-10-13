# Project notes (user preferences for JV Analyzer)

## Inspect charts
- Current-density plots show positive photovoltaic curves falling toward zero with increasing voltage, with minor ticks.
- All pixels shown together by default, with an all-pixels on/off switch.
- Chart toolbar hidden in normal charts; shown only in enlarged charts.
- Pixel selection is a toggle strip below the file list, never an in-chart legend.
- Forward and reverse of one pixel share one colour, both solid.
- Grid lines behind a switch, off by default; major lines visible, minor lines much fainter.
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
