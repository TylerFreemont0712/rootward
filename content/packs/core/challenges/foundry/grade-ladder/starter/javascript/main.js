/** The number in text, or null when text is not a number. */
function parseScore(text) {
  const trimmed = text.trim();
  // Number("") is 0, so empty text needs its own check.
  const value = trimmed === "" ? NaN : Number(trimmed);
  return Number.isNaN(value) ? null : value;
}

function grade(text) {
  const score = parseScore(text);
  // TODO: invalid input and scores outside 0-100 come first. And is exactly 90 an A here?
  if (score > 90) return "A";
  if (score > 80) return "B";
  if (score > 70) return "C";
  if (score > 60) return "D";
  return "F";
}

function main(input) {
  for (const line of input.split("\n")) {
    if (line.trim()) console.log(grade(line));
  }
}

main(require("fs").readFileSync(0, "utf8"));
