function main(input) {
  let total = 0;
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    // TODO: add the number to the total instead of replacing it, and remember the largest total for the last line
    total = Number(line);
    console.log(String(total));
  }
}

main(require("fs").readFileSync(0, "utf8"));
