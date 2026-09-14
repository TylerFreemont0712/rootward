Run the starter on `C 100`. It prints two lines. Where does each one come from? [py.functions.define]
---
`print` shows a value; `return` hands it back to whoever called the function. A function that reaches its end without `return` gives back `None` in Python and `undefined` in JavaScript, and that is what `main` prints next. [py.functions.define]
---
Make `convert` return a string in every case: one formula for `C`, the other for `F`, and `unknown scale X` for anything else. Format with one decimal place: `f"{value:.1f}"` in Python, `value.toFixed(1)` in JavaScript.
---
```python
if scale == "C":
    return f"{reading * 9 / 5 + 32:.1f} F"
if scale == "F":
    return f"{(reading - 32) * 5 / 9:.1f} C"
return f"unknown scale {scale}"
```
