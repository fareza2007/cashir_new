$html = [System.IO.File]::ReadAllText('c:\Users\OC\Desktop\apk_kasir_sederhana\index_base.html', [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText('c:\Users\OC\Desktop\apk_kasir_sederhana\style.css', [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText('c:\Users\OC\Desktop\apk_kasir_sederhana\app.js', [System.Text.Encoding]::UTF8)

$html = $html.Replace('<!-- CSS_INJECT -->', "<style>`n$css`n</style>")
$html = $html.Replace('<!-- JS_INJECT -->', "<script>`n$js`n</script>")

[System.IO.File]::WriteAllText('c:\Users\OC\Desktop\apk_kasir_sederhana\index.html', $html, [System.Text.Encoding]::UTF8)
Write-Host "Berhasil menggabungkan file dengan UTF-8!"
