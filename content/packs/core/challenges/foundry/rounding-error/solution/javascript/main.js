/** Whole cents for an amount such as "0.29" or "5". */
function toCents(amount) {
  // A number holds the nearest binary fraction, so Number("0.29") * 100 is 28.999999999999996. Math.trunc would cut
  // that to 28; Math.round goes to the nearest whole cent, which is exact for amounts with at most two decimal places.
  return Math.round(Number(amount) * 100);
}

function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [price, paid] = line.trim().split(/\s+/);
    // Subtract whole cents, never floating-point amounts: integer arithmetic is exact.
    const change = toCents(paid) - toCents(price);
    console.log(change >= 0 ? String(change) : `short ${-change}`);
  }
}

main(require("fs").readFileSync(0, "utf8"));
