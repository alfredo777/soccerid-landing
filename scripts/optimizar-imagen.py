#!/usr/bin/env python3
"""
Convierte una foto pesada en versiones listas para web.

    python scripts/optimizar-imagen.py assets/images/opi2.png
    python scripts/optimizar-imagen.py assets/images/foto.png --ancho 1920

Genera, junto al original, un `<nombre>-web.jpg` y un `<nombre>-web.webp`.
El WebP es la versión que recibirá casi todo el mundo; el JPEG es el respaldo
para navegadores viejos. Se usan juntos con <picture>:

    <picture>
      <source srcset="/assets/images/foo-web.webp" type="image/webp">
      <img src="/assets/images/foo-web.jpg" alt="…">
    </picture>

Por qué existe: el hero llevaba un PNG de 2.5 MB. PNG es el formato correcto
para logos y capturas con texto, y el equivocado para fotografía: no descarta
información que el ojo no ve. La misma imagen en JPEG pesa 310 KB y en WebP
216 KB, sin diferencia visible a tamaño de pantalla.

NUNCA borra el original: es el máster del que se regenera si cambian los
tamaños o la calidad.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Falta Pillow: pip install Pillow')

Image.MAX_IMAGE_PIXELS = None

CALIDAD_JPEG = 82
CALIDAD_WEBP = 80


def humano(ruta):
    kb = os.path.getsize(ruta) / 1024
    return f'{kb/1024:.2f} MB' if kb > 1024 else f'{kb:.0f} KB'


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit('Uso: python scripts/optimizar-imagen.py <imagen> [--ancho 1920]')
    origen = args[0]
    if not os.path.exists(origen):
        sys.exit(f'No encuentro {origen}')

    ancho = None
    if '--ancho' in sys.argv:
        ancho = int(sys.argv[sys.argv.index('--ancho') + 1])

    im = Image.open(origen).convert('RGB')
    print(f'\n  original  {os.path.basename(origen)}  {im.width}x{im.height}  {humano(origen)}')

    # Ampliar una foto no añade detalle, solo peso: solo se reduce.
    if ancho and im.width > ancho:
        alto = round(im.height * ancho / im.width)
        im = im.resize((ancho, alto), Image.LANCZOS)
        print(f'  redimensionada a {im.width}x{im.height}')

    base = os.path.splitext(origen)[0]
    for ext, fmt, opts in (('jpg', 'JPEG', {'quality': CALIDAD_JPEG, 'optimize': True, 'progressive': True}),
                           ('webp', 'WEBP', {'quality': CALIDAD_WEBP, 'method': 6})):
        destino = f'{base}-web.{ext}'
        im.save(destino, fmt, **opts)
        ahorro = 100 * (1 - os.path.getsize(destino) / os.path.getsize(origen))
        print(f'  OK {os.path.basename(destino):26} {humano(destino):>9}   -{ahorro:.0f}%')

    print(f'\n  El original se conserva como máster.\n')


if __name__ == '__main__':
    main()
