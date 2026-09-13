function main(input) {
  const register = new Map();
  for (const line of input.split("\n")) {
    const [command, name, arg] = line.trim().split(/\s+/);
    if (!command) continue;
    if (command === "set") register.set(name, Number(arg));
    else if (command === "print") console.log(String(register.get(name)));
    // TODO: add, copy, and names that were never set
  }
}

main(require("fs").readFileSync(0, "utf8"));
