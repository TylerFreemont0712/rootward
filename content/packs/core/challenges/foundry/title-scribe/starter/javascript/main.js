const SMALL_WORDS = new Set(["a", "an", "and", "at", "in", "of", "on", "or", "the", "to"]);

function titleCase(line) {
  // TODO: lowercase the rest of each word, and keep small words lowercase unless they are first or last
  return line
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function main(input) {
  const lines = input.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) console.log(titleCase(line));
}

main(require("fs").readFileSync(0, "utf8"));
