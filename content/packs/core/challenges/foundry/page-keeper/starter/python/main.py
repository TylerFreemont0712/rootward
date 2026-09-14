import sys


def page_range(total: int, per_page: int, page: int) -> str:
    # TODO: pages and entries are counted from 1. And what should a page that does not exist print?
    first = page * per_page
    last = first + per_page
    return f"{first}-{last}"


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            total, per_page, page = map(int, line.split())
            print(page_range(total, per_page, page))


if __name__ == "__main__":
    main()
