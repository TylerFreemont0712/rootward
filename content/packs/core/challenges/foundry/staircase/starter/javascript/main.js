function main(input) {
  const n = Number(input.trim());
  // TODO: the first line comes out empty and the last step is missing. And the steps should lean right.
  for (let step = 0; step < n; step++) console.log("#".repeat(step));
}

main(require("fs").readFileSync(0, "utf8"));
