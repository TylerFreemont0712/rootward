/** The reading converted to the other scale, formatted like "212.0 F". */
function convert(scale, reading) {
  // return hands the text back to the caller; console.log would only show it, and the function would give back undefined.
  if (scale === "C") return `${((reading * 9) / 5 + 32).toFixed(1)} F`;
  if (scale === "F") return `${(((reading - 32) * 5) / 9).toFixed(1)} C`;
  return `unknown scale ${scale}`;
}

function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [scale, reading] = line.trim().split(/\s+/);
    console.log(convert(scale, Number(reading)));
  }
}

main(require("fs").readFileSync(0, "utf8"));
