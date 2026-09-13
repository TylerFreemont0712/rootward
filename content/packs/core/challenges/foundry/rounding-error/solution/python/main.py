import sys


def to_cents(amount: str) -> int:
    """Whole cents for an amount such as "0.29" or "5".

    A float holds the nearest binary fraction, so float("0.29") * 100 is 28.999999999999996. int() would cut that to
    28; round() goes to the nearest whole cent, which is exact for amounts with at most two decimal places.
    """
    return round(float(amount) * 100)


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        price, paid = line.split()
        # Subtract whole cents, never floats: integer arithmetic is exact.
        change = to_cents(paid) - to_cents(price)
        print(change if change >= 0 else f"short {-change}")


if __name__ == "__main__":
    main()
