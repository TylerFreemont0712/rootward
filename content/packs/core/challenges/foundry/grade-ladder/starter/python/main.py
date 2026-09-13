import sys


def parse_score(text: str) -> float | None:
    """The number in text, or None when text is not a number (including "nan")."""
    try:
        value = float(text)
    except ValueError:
        return None
    return None if value != value else value  # NaN is the only value that is not equal to itself


def grade(text: str) -> str:
    score = parse_score(text)
    # TODO: invalid input and scores outside 0-100 come first. And is exactly 90 an A here?
    if score > 90:
        return "A"
    if score > 80:
        return "B"
    if score > 70:
        return "C"
    if score > 60:
        return "D"
    return "F"


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            print(grade(line))


if __name__ == "__main__":
    main()
