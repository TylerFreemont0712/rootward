import sys

PUNCT = '.,!?;:"\'()'


def count_words(text: str) -> dict[str, int]:
    """Return a mapping of normalized word -> count.

    split() with no argument handles any whitespace and never yields empty strings; strip(PUNCT) only touches
    the ends, so "don't" keeps its apostrophe while "'quoted'" loses both quotes.
    """
    counts: dict[str, int] = {}
    for raw in text.split():
        word = raw.lower().strip(PUNCT)
        if not word:
            continue
        counts[word] = counts.get(word, 0) + 1
    return counts


def main() -> None:
    counts = count_words(sys.stdin.read())
    # A tuple key sorts by count descending (negated) and then by word ascending.
    for word, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"{word} {count}")


if __name__ == "__main__":
    main()
