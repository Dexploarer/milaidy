## 2025-02-27 - Hide exact HTTP status codes from 3rd party APIs
**Vulnerability:** The bug report endpoint was returning the exact HTTP status code received from the GitHub API directly to the user in an error message.
**Learning:** Exposing detailed HTTP status codes or stack traces from third-party APIs can leak information about the internal workings, dependencies, or state of the backend systems to external users, potentially aiding an attacker in footprinting or reconnaissance.
**Prevention:** Catch errors from third-party APIs and map them to generic error messages for the user. Log the detailed error (including the exact status code or stack trace) internally for debugging instead of passing it in the HTTP response.
