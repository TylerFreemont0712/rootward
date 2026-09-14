import sys


def convert(scale: str, reading: float) -> str:
    """The reading converted to the other scale, formatted like "212.0 F"."""
    # TODO: this prints the answer instead of returning it, so main prints None. And what about F and other scales?
    print(f"{reading * 9 / 5 + 32:.1f} F")


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            scale, reading = line.split()
            print(convert(scale, float(reading)))


if __name__ == "__main__":
    main()
