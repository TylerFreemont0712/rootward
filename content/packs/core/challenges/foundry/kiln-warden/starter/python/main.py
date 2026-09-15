import sys


def tally(lines: list[str]) -> dict[str, int]:
    """Each metal's net score across every line: +1 per "temper" verdict, -1 per "crack" verdict."""
    # TODO: this overwrites each metal's score instead of adding to it, and prints instead of returning.
    scores = {}
    for line in lines:
        metal, verdict = line.split()
        scores[metal] = 1 if verdict == "temper" else -1
    print(scores)


def main() -> None:
    lines = [line for line in sys.stdin.read().splitlines() if line.strip()]
    for metal, score in tally(lines).items():
        print(f"{metal}: {score}")


if __name__ == "__main__":
    main()
