import sys


def convert(scale: str, reading: float) -> str:
    """The reading converted to the other scale, formatted like "212.0 F"."""
    # return hands the text back to the caller; print would only show it, and the function would give back None.
    if scale == "C":
        return f"{reading * 9 / 5 + 32:.1f} F"
    if scale == "F":
        return f"{(reading - 32) * 5 / 9:.1f} C"
    return f"unknown scale {scale}"


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            scale, reading = line.split()
            print(convert(scale, float(reading)))


if __name__ == "__main__":
    main()
