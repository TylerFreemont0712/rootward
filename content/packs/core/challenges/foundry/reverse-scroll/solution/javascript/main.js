function main(input) {
  const lines = input.split("\n");
  // A final newline leaves one empty string at the end of the split; it is not a line.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    // filter(Boolean) drops the empty strings that leading or trailing whitespace leaves behind.
    const words = line.split(/\s+/).filter(Boolean);
    console.log(words.reverse().join(" "));
  }
}

main(require("fs").readFileSync(0, "utf8"));
