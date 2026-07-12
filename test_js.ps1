$ie = New-Object -ComObject InternetExplorer.Application
$ie.Visible = $false
$ie.Navigate('about:blank')
while($ie.Busy) { Start-Sleep -Milliseconds 100 }
$doc = $ie.Document
$script = $doc.createElement('script')
$script.text = "window.onerror = function(msg, url, line) { window.jsError = msg + ' at line ' + line; };"
$doc.body.appendChild($script)

$script2 = $doc.createElement('script')
$script2.src = 'file:///C:/Users/OC/Desktop/apk_kasir_sederhana/app.js'
$doc.body.appendChild($script2)

Start-Sleep -Seconds 2
$errorMsg = $ie.Document.parentWindow.jsError
if ($errorMsg) { Write-Host "JS ERROR: $errorMsg" } else { Write-Host "No JS errors caught." }
$ie.Quit()
