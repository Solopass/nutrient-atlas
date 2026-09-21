# Renders public/icons/icon.svg to the PNG sizes the PWA manifest needs, using headless Edge.
#   pwsh scripts/render-icons.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$svg = [IO.File]::ReadAllText("$root\public\icons\icon.svg")
$tmp = Join-Path $env:TEMP 'atlas-icons'; New-Item -ItemType Directory -Force $tmp | Out-Null
$targets = @(
  @{ name = 'icon-192.png'; size = 192; pad = 0 },
  @{ name = 'icon-512.png'; size = 512; pad = 0 },
  @{ name = 'apple-touch-icon.png'; size = 180; pad = 0 },
  # maskable: platforms crop to a circle/squircle, so keep the art inside the central 80%
  @{ name = 'maskable-512.png'; size = 512; pad = 0.1 }
)
foreach ($t in $targets) {
  $inner = [int]($t.size * (1 - 2 * $t.pad)); $off = [int]($t.size * $t.pad)
  $html = "<html><body style='margin:0;background:#080b11;width:$($t.size)px;height:$($t.size)px;overflow:hidden'><div style='position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px'>$($svg -replace '<svg ', "<svg width='$inner' height='$inner' ")</div></body></html>"
  $file = Join-Path $tmp "$($t.name).html"; [IO.File]::WriteAllText($file, $html)
  & $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size="$($t.size),$($t.size)" --screenshot="$root\public\icons\$($t.name)" "file:///$($file.Replace([char]92, [char]47))" 2>$null | Out-Null
  Start-Sleep -Milliseconds 400
}
Get-ChildItem "$root\public\icons" | Select-Object Name, Length
