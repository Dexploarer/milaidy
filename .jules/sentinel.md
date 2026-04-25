## 2025-04-26 - Missing Table Existence Check in Row Mutations
**Vulnerability:** Authorization bypass. PUT (update) and DELETE endpoints in /api/database/tables/:table/rows did not verify that the target table was a valid user table (using assertTableExists), unlike GET and POST endpoints.
**Learning:** This oversight allowed potential modification/deletion of arbitrary or internal tables if an attacker guessed the table name, bypassing the safety mechanisms intended to restrict queries to user-facing base tables.
**Prevention:** Always apply the exact same authorization and existence checks across all CRUD operations for a given resource.
