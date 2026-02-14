## 2025-05-18 - Hover-only content is inaccessible
**Learning:** The wallet tooltip was previously only revealed on `:hover`, making it completely inaccessible to keyboard users and screen reader users who don't trigger mouse events.
**Action:** Use `:focus-within` in combination with `:hover` to ensure that when a user tabs into a container, any disclosure widgets (like tooltips or dropdowns) become visible. Also ensure triggers are interactive elements (buttons) so they can receive focus.
