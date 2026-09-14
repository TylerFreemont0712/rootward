function longestStreak(items) {
  let bestLength = 0;
  let bestItem = "";
  let runLength = 0;
  let previous;
  for (const item of items) {
    // A run continues while the item repeats; a different item starts a new run of 1.
    runLength = item === previous ? runLength + 1 : 1;
    previous = item;
    // Strictly longer only, so the first of two equal runs stays the answer.
    if (runLength > bestLength) {
      bestLength = runLength;
      bestItem = item;
    }
  }
  return [bestLength, bestItem];
}

function main(input) {
  const lines = input.split("\n");
  // A final newline leaves one empty string at the end of the split; it is not a line.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    // filter(Boolean) drops the empty strings that leading or trailing whitespace leaves behind.
    const [length, item] = longestStreak(line.split(/\s+/).filter(Boolean));
    console.log(length > 0 ? `${length} ${item}` : "0");
  }
}

main(require("fs").readFileSync(0, "utf8"));
