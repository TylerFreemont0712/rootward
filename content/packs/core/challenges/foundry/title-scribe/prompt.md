# The Title Scribe

The Guild's scribe copies book titles into the catalog, and the Null Wraith keeps smudging the capitals.

Print each line of input in title case. Words are separated by single spaces. A word gets an uppercase first letter
and lowercase for the rest. These small words stay all lowercase: `a`, `an`, `and`, `at`, `in`, `of`, `on`, `or`,
`the`, `to`, except when one is the first or the last word of its line. An empty line stays empty. The input is ASCII
and ends with a newline.

```
input:  the lord OF the rings
        A TALE of two cities
        something to hold on to
output: The Lord of the Rings
        A Tale of Two Cities
        Something to Hold on To
```
