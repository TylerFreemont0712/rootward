**What it required.** A function that returns its result in every case, so that the code calling it decides what to
do with that result.

**The pattern to remember.** `return` gives a value back to the caller; `print` only shows it [py.functions.define]. A
function that ends without `return` gives back `None` in Python or `undefined` in JavaScript. Returning keeps a function
reusable: the same `convert` could fill a table, feed a test, or be printed.

**Where it usually goes wrong.**
- Printing inside the function, which shows the answer once and then `None` or `undefined` when `main` prints the
  result.
- Returning in only one branch, so the other scale falls through to `None`.
- Using integer division or rounding too early, which turns `37.8` into `37.0` or `38.0`.

**Try later.** Add Kelvin (`K`), and let `convert` take the target scale as a second argument.
