function main(input) {
  let total = 0;
  let best = null; // null means "no total yet"; 0 could be a real answer
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    total += Number(line); // rebinds total to a new value built from the old one
    console.log(String(total));
    if (best === null || total > best) best = total;
  }
  if (best !== null) console.log(`max ${best}`);
}

main(require("fs").readFileSync(0, "utf8"));
