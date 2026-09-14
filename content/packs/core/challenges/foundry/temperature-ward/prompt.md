# The Temperature Ward

The Guild's hothouse keeps two thermometers, one in Celsius and one in Fahrenheit, and the Null Wraith keeps swapping
their readings for nothing at all.

Each line of input holds a scale and a reading, such as `C 100` or `F 212`. Convert the reading to the other scale and
print it with one decimal place, followed by the new scale: `C 100` prints `212.0 F`. Use `F = C * 9 / 5 + 32` and
`C = (F - 32) * 5 / 9`. For any other scale letter, print `unknown scale X`. Skip blank lines.

The starter's `main` already reads the input and prints whatever `convert` gives back. Finish `convert`.

```
input:  C 100
        F 32
        C 37
output: 212.0 F
        0.0 C
        98.6 F
```
