# Exporta el favicon en todos sus tamaños a partir del PNG maestro aprobado
# (isotipo circular azul con iD, fondo transparente).
#
# Uso:  pwsh scripts/favicon.ps1 [ruta-al-png-maestro]
#
# Recorta el área visible del símbolo (los píxeles no transparentes), lo
# centra en un lienzo cuadrado con un margen igual por los cuatro lados y
# escribe los PNG de 16 a 512 px y favicon.ico (16, 32 y 48 dentro). No añade
# fondo: la transparencia del maestro se conserva.
param([string]$Maestro = (Join-Path (Split-Path $PSScriptRoot -Parent) 'assets\images\favicon\maestro.png'))
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $raiz 'assets\images'
$o = [Drawing.Bitmap]::FromFile((Resolve-Path $Maestro))

# Caja del símbolo: filas y columnas con algún píxel visible.
$x0 = $o.Width; $y0 = $o.Height; $x1 = 0; $y1 = 0
for ($y = 0; $y -lt $o.Height; $y += 2) {
  for ($x = 0; $x -lt $o.Width; $x += 2) {
    if ($o.GetPixel($x, $y).A -gt 24) {
      if ($x -lt $x0) { $x0 = $x }; if ($x -gt $x1) { $x1 = $x }
      if ($y -lt $y0) { $y0 = $y }; if ($y -gt $y1) { $y1 = $y }
    }
  }
}
$lado = [Math]::Max($x1 - $x0, $y1 - $y0) + 2
$cx = ($x0 + $x1) / 2; $cy = ($y0 + $y1) / 2
"símbolo: {0}x{1} px dentro de {2}x{3}" -f ($x1 - $x0), ($y1 - $y0), $o.Width, $o.Height

function Exportar([int]$px, [double]$margen) {
  $b = New-Object Drawing.Bitmap $px, $px, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($b)
  $g.Clear([Drawing.Color]::Transparent)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $util = $px * (1 - 2 * $margen)
  $off = ($px - $util) / 2
  $src = New-Object Drawing.RectangleF ([float]($cx - $lado / 2)), ([float]($cy - $lado / 2)), ([float]$lado), ([float]$lado)
  $dst = New-Object Drawing.RectangleF ([float]$off), ([float]$off), ([float]$util), ([float]$util)
  $g.DrawImage($o, $dst, $src, [Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $b
}

# En la pestaña el símbolo necesita casi todo el cuadro para leerse; en los
# iconos grandes (pantalla de inicio) respira más.
$tamanos = @{ 'favicon-16x16.png' = @(16, 0.0); 'favicon-32x32.png' = @(32, 0.02); 'favicon-48x48.png' = @(48, 0.03);
  'apple-touch-icon.png' = @(180, 0.06); 'icon-192.png' = @(192, 0.06); 'icon-512.png' = @(512, 0.06) }
foreach ($n in $tamanos.Keys) {
  $b = Exportar $tamanos[$n][0] $tamanos[$n][1]
  $b.Save((Join-Path $dest $n), [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  "{0,-22} {1} px" -f $n, $tamanos[$n][0]
}

# favicon.ico con PNG dentro (16, 32, 48), el formato que aceptan todos los
# navegadores actuales.
$pngs = foreach ($n in 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png') { , [IO.File]::ReadAllBytes((Join-Path $dest $n)) }
$ms = New-Object IO.MemoryStream; $w = New-Object IO.BinaryWriter $ms
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count; $lados = 16, 32, 48
for ($i = 0; $i -lt $pngs.Count; $i++) {
  $w.Write([byte]$lados[$i]); $w.Write([byte]$lados[$i]); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
[IO.File]::WriteAllBytes((Join-Path $dest 'favicon.ico'), $ms.ToArray())
"favicon.ico            16/32/48 px (la sirve la ruta de la raíz)"
$o.Dispose()
