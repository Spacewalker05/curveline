"""
JV Analyzer - Streamlit host.

The React UI (built into ./streamlit_frontend) runs as a Streamlit custom component.
It sends the uploaded files + settings to Python, Python runs backend/jv_analysis_core.py
and sends the results back. No separate server or port is needed.

    pnpm install && pnpm build:streamlit      # commit ./streamlit_frontend
    pip install -r requirements.txt
    streamlit run streamlit_app.py
"""
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

import importlib

import backend.analyze as _backend

# Streamlit keeps imported modules alive between reruns/redeploys; reload so a
# freshly pulled backend/analyze.py (e.g. the new `inspect` handler) is always used.
_backend = importlib.reload(_backend)
analyze, inspect = _backend.analyze, _backend.inspect

FRONTEND = Path(__file__).parent / "streamlit_frontend"

st.set_page_config(page_title="JV Analyzer", layout="wide", initial_sidebar_state="collapsed")
st.markdown(
    "<style>header,footer{display:none!important}.block-container{padding:0!important;max-width:100%!important}</style>",
    unsafe_allow_html=True,
)

if not (FRONTEND / "index.html").exists():
    st.error("Frontend not built. Run `pnpm build:streamlit` and commit the `streamlit_frontend` folder.")
    st.stop()

HANDLERS = {"analyze": analyze, "inspect": inspect}

jv_ui = components.declare_component("jv_ui", path=str(FRONTEND))

response = st.session_state.get("response")
request = jv_ui(response=response, key="jv", default=None)

if request and request.get("id") != st.session_state.get("handled_id"):
    st.session_state["handled_id"] = request["id"]
    try:
        st.session_state["response"] = {"id": request["id"], "result": HANDLERS[request.get("kind", "analyze")](request["files"], request.get("params") or {})}
    except Exception as exc:
        st.session_state["response"] = {"id": request["id"], "error": str(exc)}
    st.rerun()
