# The Unbound Name

The Null Wraith feeds on names that were never given a value. Keep the Guild's register tidy.

Read commands, one per line, and keep a register of named integers:

- `set NAME VALUE` binds `NAME` to the integer `VALUE`.
- `add NAME VALUE` adds `VALUE` to the value of `NAME`.
- `copy TARGET SOURCE` binds `TARGET` to the current value of `SOURCE`. Changing `SOURCE` later leaves `TARGET` alone.
- `print NAME` prints the value of `NAME`.

When a command reads a name that was never bound, print `unbound NAME` and change nothing. Skip blank lines.

```
input:  set gold 5
        copy saved gold
        add gold 3
        print gold
        print saved
        print silver
output: 8
        5
        unbound silver
```
