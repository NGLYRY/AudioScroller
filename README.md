# Two linked sliders

This small demo contains two HTML range inputs that mirror each other: when you move one slider, the other follows.

Files:
- `index.html` — demo page
- `styles.css` — simple styling
- `script.js` — linking logic

How to run
- Option 1: open `index.html` in your browser (double-click). This works for most browsers.
- Option 2 (recommended for local development): run a simple static server in the project folder. For example, with Python 3:

```bash
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

Behaviour
- Each slider updates the other immediately while you drag (the `input` event). Values are displayed next to each slider.

Notes
- The sliders share min/max/step values when you interact with either for robustness.
