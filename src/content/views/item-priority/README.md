# Item Priority

`writeItemPriority(item, priority, queue, onCommitted)` is the shared persist-then-reflect priority
operation used by Project Tracking rows and Sprint cards. It owns the guarded field request, folds
the committed revision back into the item, and invokes the UI callback only after success.
