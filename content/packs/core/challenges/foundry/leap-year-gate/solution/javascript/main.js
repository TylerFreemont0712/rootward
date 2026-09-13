function isLeap(year) {
  // The most specific rule first, so each later check can assume the earlier ones did not apply.
  // Negative years work too: -4 % 4 is -0 in JavaScript, and -0 === 0 is true.
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

function main(input) {
  for (const line of input.split("\n")) {
    if (line.trim()) console.log(isLeap(Number(line)) ? "leap" : "common");
  }
}

main(require("fs").readFileSync(0, "utf8"));
