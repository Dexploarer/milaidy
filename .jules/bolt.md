## 2026-02-15 - Determinism in Parallel Processing
**Learning:** When using `Promise.all` to parallelize data fetching, ensure that the *processing* of the fetched data happens sequentially if the order matters (e.g., for file reproducibility or precedence rules). Direct side-effects inside `map` callbacks can lead to non-deterministic results.
**Action:** Fetch data with `Promise.all`, then iterate over the results array synchronously to process them.
