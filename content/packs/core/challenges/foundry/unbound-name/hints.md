Run the example by hand and write the register down after every line. After `add gold 3`, what is `saved`? [py.basics.variables]
---
A name is bound to a value, not to another name: after `copy saved gold`, `saved` holds `5`, and rebinding `gold` later does not touch it. Before reading a name, check that it is bound: `name in register` in Python, `register.has(name)` in JavaScript. [py.basics.variables]
---
Handle each command in its own branch. `add` and `copy` first check the name they read; if it is missing, print `unbound NAME` and do nothing else. `copy` stores the source's current value under the target name. `print` checks too.
---
```python
elif command == "copy":
    source = parts[2]
    if source in register:
        register[name] = register[source]
    else:
        print(f"unbound {source}")
```
