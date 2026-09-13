import sys

PUNCT = '.,!?;:"\'()'


def count_words(text: str) -> dict[str, int]:
    """Return a mapping of normalized word -> count."""
    counts: dict[str, int] = {}
    # TODO: split, normalize (lowercase + strip PUNCT from both ends), skip empties, count
    return counts


def main() -> None:
    text = sys.stdin.read()
    counts = count_words(text)
    # TODO: sort by count desc, then word asc; print "word count" per line
    for word, count in counts.items():
        print(f"{word} {count}")


if __name__ == "__main__":
    main()
