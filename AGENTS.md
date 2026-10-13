<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# JV Analyzer (ported from GitHub Spacewalker05/curveline)
- The whole app lives in src/jv and is lazy-loaded behind ClientOnly on `/`; Plotly touches the DOM at import time, so it must stay out of SSR.
- J–V analysis runs in the browser (src/jv/core.ts ports backend/jv_analysis_core.py); there is no server, so behaviour matches the Python logic without hosting Python.
- Inspect and Parameter Calculation share core.ts parsing and the forward/reverse split, so both screens read files the same way.
- Keep paper-chart colours as global CSS tokens (--c-plot-*) and read them through cv(); printed charts stay the same across themes.
- Inspect normalizes current-density polarity per scan from the sample nearest zero voltage, not pointwise absolute values, to preserve the physical zero crossing without folding the post-Voc tail.
- Parameter Calculation and enlarged charts use the Cartesian Plotly bundle so original box plots render with individual measurements and means.
- Centralize plot image naming in src/jv/plot-export.ts and carry it on chart elements into enlarged views so direct, toolbar and bulk downloads stay consistent.
