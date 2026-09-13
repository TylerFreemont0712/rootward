function isMirror(line) {
  // TODO: ignore case, and everything that is not a letter or a digit
  for (let i = 0; i < Math.floor(line.length / 2); i++) {
    if (line[i] !== line[line.length - i]) return false;
  }
  return true;
}

function main(input) {
  for (const line of input.split("\n")) console.log(isMirror(line) ? "open" : "shut");
}

main(require("fs").readFileSync(0, "utf8"));
