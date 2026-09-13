function isLeap(year) {
  // TODO: centuries are an exception, and every 400th year is an exception to that exception
  return year % 4 === 0;
}

function main(input) {
  for (const line of input.split("\n")) {
    if (line.trim()) console.log(isLeap(Number(line)) ? "leap" : "common");
  }
}

main(require("fs").readFileSync(0, "utf8"));
