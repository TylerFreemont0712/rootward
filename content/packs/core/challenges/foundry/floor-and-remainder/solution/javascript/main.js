function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [a, b] = line.trim().split(/\s+/).map(Number);
    // Guard first: 7 / 0 is Infinity and 7 % 0 is NaN, and neither is an answer.
    if (b === 0) {
      console.log("undefined");
      continue;
    }
    // % keeps the sign of a (-7 % 2 is -1), so derive the remainder from the floored quotient instead.
    const q = Math.floor(a / b);
    const r = a - q * b;
    console.log(`${q} ${r}`);
  }
}

main(require("fs").readFileSync(0, "utf8"));
