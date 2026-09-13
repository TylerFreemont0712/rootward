function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [a, b] = line.trim().split(/\s+/).map(Number);
    // TODO: b can be 0. And does % give the remainder this task asks for when a is negative?
    console.log(`${Math.trunc(a / b)} ${a % b}`);
  }
}

main(require("fs").readFileSync(0, "utf8"));
