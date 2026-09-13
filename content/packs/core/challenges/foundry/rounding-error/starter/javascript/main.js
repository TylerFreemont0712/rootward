/** Whole cents for an amount such as "0.29" or "5". */
function toCents(amount) {
  // TODO: 0.29 comes out as 28 cents here. What is Number(amount) * 100, exactly?
  return Math.trunc(Number(amount) * 100);
}

function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [price, paid] = line.trim().split(/\s+/);
    const change = toCents(paid) - toCents(price);
    // TODO: a negative change means the payment was short
    console.log(String(change));
  }
}

main(require("fs").readFileSync(0, "utf8"));
