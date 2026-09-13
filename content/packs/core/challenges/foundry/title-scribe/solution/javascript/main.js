const SMALL_WORDS = new Set(["a", "an", "and", "at", "in", "of", "on", "or", "the", "to"]);

function titleCase(line) {
  const words = line.split(" ");
  const last = words.length - 1;
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (SMALL_WORDS.has(lower) && index > 0 && index < last) return lower;
      // slice(0, 1) is "" for an empty word, where lower[0] would be undefined.
      return lower.slice(0, 1).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function main(input) {
  const lines = input.split("\n");
  // A final newline leaves one empty string at the end of the split; it is not a line.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) console.log(titleCase(line));
}

main(require("fs").readFileSync(0, "utf8"));
