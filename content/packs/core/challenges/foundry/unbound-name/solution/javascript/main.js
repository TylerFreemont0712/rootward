function main(input) {
  const register = new Map();
  for (const line of input.split("\n")) {
    const [command, name, arg] = line.trim().split(/\s+/);
    if (!command) continue;
    if (command === "set") {
      register.set(name, Number(arg));
    } else if (command === "add") {
      if (register.has(name)) register.set(name, register.get(name) + Number(arg));
      else console.log(`unbound ${name}`);
    } else if (command === "copy") {
      // The target gets the source's current number; a later change rebinds only the source.
      if (register.has(arg)) register.set(name, register.get(arg));
      else console.log(`unbound ${arg}`);
    } else if (command === "print") {
      console.log(register.has(name) ? String(register.get(name)) : `unbound ${name}`);
    }
  }
}

main(require("fs").readFileSync(0, "utf8"));
