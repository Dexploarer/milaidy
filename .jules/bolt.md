## 2024-05-19 - Sorting Optimization
**Learning:** Frequent Date operations during sorts trigger garbage collection and performance issues on render, notably O(N*logN) cost. React relies extensively on component state array references.
**Action:** Always parse timestamps as `Date.parse(dateString)` avoiding `new Date()` object allocation, especially inside Array.prototype.sort or useMemo callbacks handling large arrays.
