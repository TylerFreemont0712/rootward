import sys

SMALL_WORDS = {"a", "an", "and", "at", "in", "of", "on", "or", "the", "to"}


def title_case(line: str) -> str:
    # TODO: str.title() is close. Check the small words, the first and last words, and "don't".
    return line.title()


def main() -> None:
    for line in sys.stdin.read().splitlines():
        print(title_case(line))


if __name__ == "__main__":
    main()
