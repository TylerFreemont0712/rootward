const UNITS = { h: 3600, m: 60, s: 1 };
const ORDER = "hms";

/** Total seconds for text like "1h30m15s", or null when the text is not a valid duration. */
function parseDuration(text) {
  let total = 0;
  let digits = "";
  let lastUnit = -1;
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      digits += char;
    } else if (ORDER.includes(char) && digits !== "") {
      const position = ORDER.indexOf(char);
      // Units come in the order h, m, s, each at most once.
      if (position <= lastUnit) return null;
      total += Number(digits) * UNITS[char];
      digits = "";
      lastUnit = position;
    } else {
      return null;
    }
  }
  // Digits left over have no unit, and a text with no unit at all has no parts.
  return digits === "" && lastUnit >= 0 ? total : null;
}

function main(input) {
  const lines = input.split("\n");
  // A final newline leaves one empty string at the end of the split; it is not a line.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    const seconds = parseDuration(line.trim());
    console.log(seconds === null ? "invalid" : String(seconds));
  }
}

main(require("fs").readFileSync(0, "utf8"));
