import sys


def parse_duration(text: str) -> int | None:
    """Total seconds for text like "1h30m15s", or None when the text is not a valid duration."""
    # TODO: this only handles the full "XhYmZs" form. Parts can be missing, and bad input must give None.
    hours, rest = text.split("h")
    minutes, rest = rest.split("m")
    seconds = rest.rstrip("s")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds)


def main() -> None:
    for line in sys.stdin.read().splitlines():
        seconds = parse_duration(line.strip())
        print("invalid" if seconds is None else seconds)


if __name__ == "__main__":
    main()
