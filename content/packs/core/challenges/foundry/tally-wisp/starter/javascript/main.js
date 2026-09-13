const PUNCT = '.,!?;:"\'()';

/** Return a Map of normalized word -> count. */
function countWords(text) {
  const counts = new Map();
  // TODO: split on whitespace, normalize (lowercase + trim PUNCT from both ends), skip empties, count
  return counts;
}

function main(input) {
  const counts = countWords(input);
  // TODO: sort by count desc, then word asc; print "word count" per line
  for (const [word, count] of counts) console.log(`${word} ${count}`);
}

main(require("fs").readFileSync(0, "utf8"));
