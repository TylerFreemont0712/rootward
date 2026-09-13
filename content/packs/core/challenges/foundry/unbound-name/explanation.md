**What it required.** A register that binds names to values, rebinds them with `set` and `add`, copies values with
`copy`, and reports every read of a name that was never bound.

**The pattern to remember.** Assignment binds a name to a value [py.basics.variables]. `saved = gold` gives `saved` the
value `gold` has right now; a later `gold = gold + 3` binds `gold` to a new value and leaves `saved` alone. Reading a
name that was never bound is an error (`NameError` for a Python variable, `KeyError` for a dict, `ReferenceError` for a
JavaScript variable), while a JavaScript `Map` quietly returns `undefined`, so check first.

**Where it usually goes wrong.**
- Printing `None` or `undefined` instead of `unbound NAME`.
- Letting `add` create a name that was never set.
- Reporting the target instead of the source when `copy` reads a missing name.

**Try later.** Add `del NAME`, which unbinds a name so that later reads print `unbound`.
