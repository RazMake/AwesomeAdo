# Interrupt Acceptance

`loadInterruptAcceptanceState(roots, services)` resolves the accepted and unread Interrupt item IDs
for the current tagged lifetime. Both Sprint View and Project Tracking consume the same state so
their pills cannot disagree after an item is untagged and tagged again.
