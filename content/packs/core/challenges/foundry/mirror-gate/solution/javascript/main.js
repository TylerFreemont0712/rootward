function isMirror(line) {
  const kept = line.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Strings have no reverse(): spread the characters into an array, reverse it, and join it back together.
  return kept === [...kept].reverse().join("");
}

function main(input) {
  const lines = input.split("\n");
  // A final newline leaves one empty string at the end of the split; it is not a line.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) console.log(isMirror(line) ? "open" : "shut");
}

main(require("fs").readFileSync(0, "utf8"));
