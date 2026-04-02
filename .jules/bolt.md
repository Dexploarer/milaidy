## 2024-04-02 - N+1 Query Bottlenecks in Agent Export
**Learning:** Serial `await` calls inside `for` loops querying database entries (entities, participants, components, memories) cause significant N+1 bottlenecks during agent exports, vastly slowing down the export of complex agents with many relationships.
**Action:** Batch consecutive independent queries using `Promise.all` inside mapped arrays or collected promises arrays before awaiting.
