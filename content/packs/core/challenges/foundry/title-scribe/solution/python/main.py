import sys

SMALL_WORDS = {"a", "an", "and", "at", "in", "of", "on", "or", "the", "to"}


def title_case(line: str) -> str:
    words = line.split(" ")
    last = len(words) - 1
    result = []
    for index, word in enumerate(words):
        lower = word.lower()
        if lower in SMALL_WORDS and 0 < index < last:
            result.append(lower)
        else:
            # Slicing never fails on an empty word, unlike lower[0].
            result.append(lower[:1].upper() + lower[1:])
    return " ".join(result)


def main() -> None:
    for line in sys.stdin.read().splitlines():
        print(title_case(line))


if __name__ == "__main__":
    main()
