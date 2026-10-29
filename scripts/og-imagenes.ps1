# Genera las imágenes Open Graph (1200×630) de las portadas del sitio.
#
# Uso:  pwsh scripts/og-imagenes.ps1
#
# Toma cada portada de assets/images/secciones/** (y las fotos de los viajes
# próximos que todavía usan la galería) y escribe su versión para compartir en
# assets/images/og/<misma ruta>. Recorte "cover" centrado: las portadas son
# anchas, así que casi sólo se recorta arriba y abajo y no se pierde a nadie
# de las orillas. index.js (ogDe) usa la versión og si existe y, si no, la
# foto original. Volver a correrlo al cambiar o agregar una portada.
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path $PSScriptRoot -Parent
$img = Join-Path $raiz 'assets\images'
$fuentes = @(Get-ChildItem (Join-Path $img 'secciones') -Recurse -Filter *.jpg | Where-Object { $_.Name -match 'portada|^(america|atletico|tigres)-' })
$fuentes += 'gallery\cup2025\1.jpg', 'gallery\vip\1.jpg', 'gallery\vip\3.jpg' | ForEach-Object { Get-Item (Join-Path $img $_) }
$W = 1200; $H = 630
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$par = New-Object Drawing.Imaging.EncoderParameters 1
$par.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 84L
foreach ($f in $fuentes) {
  $rel = $f.FullName.Substring($img.Length + 1)
  $dest = Join-Path (Join-Path $img 'og') $rel
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  try { $o = [Drawing.Image]::FromFile($f.FullName) }
  catch {
    # Algunos JPEG (perfil de color CMYK) no los abre GDI+: se copia el original.
    Copy-Item $f.FullName $dest -Force; "copiado tal cual: $rel"; continue
  }
  $esc = [Math]::Max($W / $o.Width, $H / $o.Height)
  $sw = [int]($W / $esc); $sh = [int]($H / $esc)
  $sx = [int](($o.Width - $sw) / 2); $sy = [int](($o.Height - $sh) * 0.45)
  $b = New-Object Drawing.Bitmap $W, $H
  $g = [Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($o, (New-Object Drawing.Rectangle 0, 0, $W, $H), (New-Object Drawing.Rectangle $sx, $sy, $sw, $sh), [Drawing.GraphicsUnit]::Pixel)
  $b.Save($dest, $codec, $par)
  $g.Dispose(); $b.Dispose(); $o.Dispose()
  "{0}  ({1:N0} KB)" -f $rel, ((Get-Item $dest).Length / 1KB)
}
