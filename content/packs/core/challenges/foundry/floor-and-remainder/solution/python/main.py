import sys


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        a, b = map(int, line.split())
        # Guard first: dividing by zero raises ZeroDivisionError.
        if b == 0:
            print("undefined")
            continue
        # // and % round toward negative infinity, which is exactly the rule, so divmod gives (q, r) directly.
        q, r = divmod(a, b)
        print(q, r)


if __name__ == "__main__":
    main()
