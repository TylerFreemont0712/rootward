function longestStreak(items) {
  let bestLength = 0;
  let bestItem = "";
  let runLength = 0;
  for (const item of items) {
    // TODO: the run should start again when the item changes, and a tie should keep the first run
    runLength += 1;
    if (runLength >= bestLength) {
      bestLength = runLength;
      bestItem = item;
    }
  }
  return [bestLength, bestItem];
}

function main(input) {
  const lines = input.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    const [length, item] = longestStreak(line.split(/\s+/).filter(Boolean));
    console.log(length > 0 ? `${length} ${item}` : "0");
  }
}

main(require("fs").readFileSync(0, "utf8"));
