function main(input) {
  const lines = input.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    // TODO: this reverses the letters, not the words. And extra spaces must not turn into empty words.
    console.log([...line].reverse().join(""));
  }
}

main(require("fs").readFileSync(0, "utf8"));
