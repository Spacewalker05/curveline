# JV Analyzer — updated Streamlit app

## Deploy
1. Extract this ZIP. Upload the contents of the curveline folder to your repository root.
2. Replace the old streamlit_frontend folder entirely, including its assets. Do not mix old and new assets.
3. In Streamlit Community Cloud, select that repository and streamlit_app.py as the entry point.

The ready-to-run compiled interface is included; no JavaScript build is needed to deploy.

## Run locally
```
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Included updates
Dashboard with explicit Run analysis, pending uploads and device settings, automatic side-panel hiding, compact side-by-side I–V/J–V charts, sample parameter plots, publication-style axes, image exports, hover-to-peek sidebar, and home navigation through the title. The original FF filter is retained; Jsc and Isc are not excluded by physical-range thresholds. Undefined calculations still remain empty.

Inside Streamlit, analysis uses the Python backend. Requests are serialized to prevent multiple Dashboard operations overwriting each other in the component protocol. Outside Streamlit, the browser calculation engine is used.

This archive keeps the original deployment folder scheme. The src folder contains editable source; Streamlit serves streamlit_frontend, not src. Editing source requires rebuilding that static interface before redeploying.
