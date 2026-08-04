# Item Assignee

`writeItemAssignee(item, picked, queue, onCommitted)` is the shared persist-then-reflect assignment
operation used by Project Tracking rows and the All Projects Catalog View. It enqueues the guarded
`System.AssignedTo` write, folds the committed revision and the new assignee back into the item, and
invokes the UI callback only after success — so a rejected write never leaves an unsaved name on
screen.

The person it hands back carries no crew tag: a tag is a Feature Crew roster fact, and the roster has
not been reconciled yet at the moment an assignment lands.
