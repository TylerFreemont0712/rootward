/** Total seconds for text like "1h30m15s", or null when the text is not a valid duration. */
function parseDuration(text) {
  // TODO: this only handles the full "XhYmZs" form. Parts can be missing, and bad input must give null.
  const [hours, rest] = text.split("h");
  const [minutes, seconds] = rest.split("m");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds.replace("s", ""));
}

function main(input) {
  const lines = input.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    const seconds = parseDuration(line.trim());
    console.log(seconds === null ? "invalid" : String(seconds));
  }
}

main(require("fs").readFileSync(0, "utf8"));
