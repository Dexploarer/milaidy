## 2024-04-23 - Cached Lowercased Strings for Nested Loops
**Learning:** Calling .toLowerCase() inside nested loops for string matching (like in fuzzy search) causes significant performance overhead and unnecessary garbage collection from redundant string allocations.
**Action:** Calculate the lowercase version of strings and cache them in arrays prior to inner search loops to speed up iterative checks over the same data.
