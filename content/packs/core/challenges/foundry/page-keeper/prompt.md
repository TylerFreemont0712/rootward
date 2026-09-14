# The Page Keeper

The Guild's catalog shows its entries one page at a time, and the Type Mimic keeps asking for pages that do not exist.

Each line of input holds three integers: `total` entries, `per_page` entries on each page (at least 1), and a `page`
number counted from 1. Print the entries shown on that page as `first-last`, numbering entries from 1. If that page does
not exist, print `none`. Skip blank lines.

```
input:  25 10 1
        25 10 3
        25 10 4
output: 1-10
        21-25
        none
```
