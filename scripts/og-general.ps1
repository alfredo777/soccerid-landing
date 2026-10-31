# Imagen general para compartir (og-image.jpg): la foto aprobada del
# SOCCER iD TOUR al atardecer, a 1200 × 630, con el logo blanco de SOCCER iD
# en la esquina superior izquierda.
#
# Uso:  pwsh scripts/og-general.ps1
#
# Parte de la versión para compartir que genera og-imagenes.ps1; volver a
# correr los dos si cambia la foto. Debajo del logo va una sombra suave para
# que se lea aunque la foto cambie.
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path $PSScriptRoot -Parent
$img = Join-Path $raiz 'assets\images'
$foto = [Drawing.Image]::FromFile((Join-Path $img 'og\secciones\travel\viaje-soccerid-tour-2027.jpg'))
$logo = [Drawing.Image]::FromFile((Join-Path $img 'logo-horizontal-blanco.png'))
$b = New-Object Drawing.Bitmap 1200, 630
$g = [Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($foto, 0, 0, 1200, 630)

# Sombra: un degradado oscuro desde la esquina, apenas visible.
$sombra = New-Object Drawing.Drawing2D.LinearGradientBrush (New-Object Drawing.Point 0, 0), (New-Object Drawing.Point 620, 260), ([Drawing.Color]::FromArgb(150, 0, 0, 0)), ([Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.FillRectangle($sombra, 0, 0, 620, 260)

$ancho = 300; $alto = [int]($logo.Height * $ancho / $logo.Width); $margen = 48
$g.DrawImage($logo, $margen, $margen, $ancho, $alto)

$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$par = New-Object Drawing.Imaging.EncoderParameters 1
$par.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 86L
$salida = Join-Path $img 'og-image.jpg'
$g.Dispose(); $foto.Dispose(); $logo.Dispose()
$b.Save($salida, $codec, $par); $b.Dispose()
"og-image.jpg  ({0:N0} KB)" -f ((Get-Item $salida).Length / 1KB)
