import sys

UNITS = {"h": 3600, "m": 60, "s": 1}
ORDER = "hms"


def parse_duration(text: str) -> int | None:
    """Total seconds for text like "1h30m15s", or None when the text is not a valid duration."""
    total, digits, last_unit = 0, "", -1
    for char in text:
        if char.isdigit():
            digits += char
        elif char in UNITS and digits:
            position = ORDER.index(char)
            # Units come in the order h, m, s, each at most once.
            if position <= last_unit:
                return None
            total += int(digits) * UNITS[char]
            digits, last_unit = "", position
        else:
            return None
    # Digits left over have no unit, and a text with no unit at all has no parts.
    return total if not digits and last_unit >= 0 else None


def main() -> None:
    for line in sys.stdin.read().splitlines():
        seconds = parse_duration(line.strip())
        print("invalid" if seconds is None else seconds)


if __name__ == "__main__":
    main()
