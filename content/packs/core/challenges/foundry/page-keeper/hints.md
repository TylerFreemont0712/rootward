Write out page 1 and page 2 of `25 10` by hand. What are the first and last entry numbers, and how do they follow from the page number? [concept.edge-cases]
---
Counting from 1 means page `p` starts after `(p - 1) * per_page` entries. Edge cases hide at the boundaries: page 0, a negative page, a catalog with no entries, a last page that is only partly full, and the page just past the end. [concept.edge-cases]
---
Compute `first = (page - 1) * per_page + 1`. If `page < 1` or `first > total`, the page does not exist. Otherwise `last` is the smaller of `page * per_page` and `total`.
---
```python
first = (page - 1) * per_page + 1
if page < 1 or first > total:
    return "none"
return f"{first}-{min(page * per_page, total)}"
```
