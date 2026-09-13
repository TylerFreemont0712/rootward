import sys


def to_cents(amount: str) -> int:
    """Whole cents for an amount such as "0.29" or "5"."""
    # TODO: 0.29 comes out as 28 cents here. What is float(amount) * 100, exactly?
    return int(float(amount) * 100)


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        price, paid = line.split()
        change = to_cents(paid) - to_cents(price)
        # TODO: a negative change means the payment was short
        print(change)


if __name__ == "__main__":
    main()
