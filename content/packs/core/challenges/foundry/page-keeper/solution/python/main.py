import sys


def page_range(total: int, per_page: int, page: int) -> str:
    first = (page - 1) * per_page + 1
    # The two ways a page can fail to exist: it comes before page 1, or it starts past the last entry.
    if page < 1 or first > total:
        return "none"
    # A last page may be only partly full.
    last = min(page * per_page, total)
    return f"{first}-{last}"


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            total, per_page, page = map(int, line.split())
            print(page_range(total, per_page, page))


if __name__ == "__main__":
    main()
