# House on the Hill - local static server (Windows, no Python/Node required).
# Serves ../dist on http://localhost:<port>/ and opens the default browser.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 [-Port 4173] [-NoBrowser]
# Stop with Ctrl+C or by closing the window.
param(
  [int]$Port = 4173,
  [string]$Root = '',
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\dist' }
$Root = (Resolve-Path -LiteralPath $Root).ProviderPath
if (-not (Test-Path -LiteralPath (Join-Path $Root 'index.html'))) { throw "index.html not found in $Root" }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.txt' = 'text/plain; charset=utf-8'
}

# find a free port (localhost prefixes do not need administrator rights)
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
}
if (-not $listener) { throw "No free port between $Port and $($Port + 19)." }

$url = "http://localhost:$Port/"
Write-Host ''
Write-Host '  House on the Hill / Shan Zhong Xiao Wu - local server' -ForegroundColor Yellow
Write-Host "  Serving: $Root"
Write-Host "  Open:    $url" -ForegroundColor Green
Write-Host '  Keep this window open while playing. Press Ctrl+C or close it to stop.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
try {
  while ($listener.IsListening) {
    $async = $listener.BeginGetContext($null, $null)
    while (-not $async.AsyncWaitHandle.WaitOne(250)) { }   # stays responsive to Ctrl+C
    $ctx = $listener.EndGetContext($async)
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
      if (-not $rel) { $rel = 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
      if (-not $file.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $res.StatusCode = 404; $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
        $res.Headers['Cache-Control'] = 'no-cache'
        $bytes = [System.IO.File]::ReadAllBytes($file)
      }
      $res.ContentLength64 = $bytes.Length
      if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch {
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.OutputStream.Close() } catch { }
    }
  }
} finally {
  $listener.Stop(); $listener.Close()
}
