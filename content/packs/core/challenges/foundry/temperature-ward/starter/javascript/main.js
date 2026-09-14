/** The reading converted to the other scale, formatted like "212.0 F". */
function convert(scale, reading) {
  // TODO: this logs the answer instead of returning it, so main logs undefined. And what about F and other scales?
  console.log(`${((reading * 9) / 5 + 32).toFixed(1)} F`);
}

function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [scale, reading] = line.trim().split(/\s+/);
    console.log(String(convert(scale, Number(reading))));
  }
}

main(require("fs").readFileSync(0, "utf8"));
