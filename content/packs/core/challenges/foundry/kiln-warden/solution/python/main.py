import sys


def tally(lines: list[str]) -> dict[str, int]:
    """Each metal's net score across every line: +1 per "temper" verdict, -1 per "crack" verdict."""
    scores: dict[str, int] = {}
    for line in lines:
        metal, verdict = line.split()
        delta = 1 if verdict == "temper" else -1
        scores[metal] = scores.get(metal, 0) + delta
    return scores


def main() -> None:
    lines = [line for line in sys.stdin.read().splitlines() if line.strip()]
    for metal, score in tally(lines).items():
        print(f"{metal}: {score}")


if __name__ == "__main__":
    main()
