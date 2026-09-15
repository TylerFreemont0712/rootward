/** Return a Map of metal -> net score across every line: +1 per "temper" verdict, -1 per "crack" verdict. */
function tally(lines) {
  const scores = new Map();
  // TODO: this overwrites each metal's score instead of adding to it, and logs instead of returning.
  for (const line of lines) {
    const [metal, verdict] = line.split(" ");
    scores.set(metal, verdict === "temper" ? 1 : -1);
  }
  console.log(scores);
}

function main(input) {
  const lines = input.split("\n").filter((line) => line.trim());
  for (const [metal, score] of tally(lines)) console.log(`${metal}: ${score}`);
}

main(require("fs").readFileSync(0, "utf8"));
