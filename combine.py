import os

with open('index_base.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

html = html.replace('<!-- CSS_INJECT -->', f'<style>\n{css}\n</style>')
html = html.replace('<!-- JS_INJECT -->', f'<script>\n{js}\n</script>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Berhasil menggabungkan CSS dan JS ke index.html menggunakan template base!")
