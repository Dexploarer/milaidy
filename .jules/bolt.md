## 2025-02-17 - Eliminate N+1 DB Queries via Promise.all
**Learning:** In I/O bound data fetches over arrays of entities, looping and calling `await` individually causes significant N+1 slowdowns as they block execution.
**Action:** Always map loop iterations to an array of unresolved Promises, then resolve them simultaneously via `Promise.all` before iterating through the results.
