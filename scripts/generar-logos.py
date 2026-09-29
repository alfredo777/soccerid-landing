#!/usr/bin/env python3
"""
Genera los recursos de logo del sitio a partir del paquete de marca.

    python scripts/generar-logos.py

Fuente: assets/images/logovariantes/ (el zip "LOGO NUEVO" del diseñador, con
el SVG, el PDF y 14 variantes PNG a 8534px). De ahí solo se usan cuatro:

    01  isotipo azul          -> fondos claros
    14  isotipo blanco        -> fondos azules y oscuros
    04  lockup horizontal azul/negro -> fondos claros
    07  lockup horizontal blanco     -> fondos azules y oscuros

Las otras diez (rojo, amarillo, naranja, morado, cian, verde, línea negra…)
son variantes de color de camiseta: no son logos principales y no se generan.

Cada salida se recorta al contenido real (bbox del canal alfa) antes de
escalar, para que el logo llene el lienzo y no quede diminuto en un favicon
de 16px. El apple-touch-icon es el único opaco: iOS no respeta transparencia
y pinta el hueco de negro, así que lleva el isotipo blanco sobre el azul de
marca. Ver docs/variables-del-proyecto.md.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Falta Pillow: pip install Pillow')

Image.MAX_IMAGE_PIXELS = None          # los originales son de 8534x8534 (72 MP)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, 'assets', 'images', 'logovariantes')
DESTINO = os.path.join(RAIZ, 'assets', 'images')

AZUL_MARCA = (27, 23, 239, 255)        # #1B17EF, el mismo de --brand-blue

VARIANTES = {
    'iso_azul':    'LOGO-SOCCERID-2026-01.png',
    'iso_blanco':  'LOGO-SOCCERID-2026-14.png',
    'horiz_azul':  'LOGO-SOCCERID-2026-04.png',
    'horiz_blanco': 'LOGO-SOCCERID-2026-07.png',
}


def cargar(clave):
    ruta = os.path.join(FUENTE, VARIANTES[clave])
    if not os.path.exists(ruta):
        sys.exit(f'No encuentro {ruta}. ¿Se descomprimió "LOGO NUEVO.zip"?')
    return Image.open(ruta).convert('RGBA')


def recortar(im):
    """Quita el margen transparente para que el logo llene el lienzo."""
    caja = im.getchannel('A').getbbox()
    return im.crop(caja) if caja else im


def cuadrado(im, lado, margen=0.04, fondo=None):
    """Encaja la imagen centrada en un lienzo cuadrado."""
    im = recortar(im)
    util = int(lado * (1 - margen * 2))
    im.thumbnail((util, util), Image.LANCZOS)
    lienzo = Image.new('RGBA', (lado, lado), fondo or (0, 0, 0, 0))
    lienzo.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2), im)
    return lienzo


def ancho_fijo(im, ancho):
    """Escala un lockup horizontal a un ancho dado, manteniendo proporción."""
    im = recortar(im)
    alto = round(im.height * ancho / im.width)
    return im.resize((ancho, alto), Image.LANCZOS)


def guardar(im, nombre):
    ruta = os.path.join(DESTINO, nombre)
    im.save(ruta, 'PNG', optimize=True)
    print(f'  OK {nombre:26} {im.width}x{im.height}  {os.path.getsize(ruta)/1024:6.1f} KB')


def main():
    print(f'\nGenerando recursos de logo en assets/images/\n')

    iso_azul = cargar('iso_azul')
    iso_blanco = cargar('iso_blanco')

    # Isotipos a tamaño de trabajo
    guardar(cuadrado(iso_azul, 512), 'logo-iso-azul.png')
    guardar(cuadrado(iso_blanco, 512), 'logo-iso-blanco.png')

    # El nombre histórico, referenciado en 16 sitios. Se deja en azul para que
    # cualquier uso que no se haya migrado siga mostrando el logo nuevo.
    guardar(cuadrado(iso_azul, 512), 'iconsoccerid.png')

    # Lockups horizontales
    guardar(ancho_fijo(cargar('horiz_azul'), 1200), 'logo-horizontal-azul.png')
    guardar(ancho_fijo(cargar('horiz_blanco'), 1200), 'logo-horizontal-blanco.png')

    # Favicons: el isotipo AZUL con su contorno negro se convierte en una
    # mancha ilegible a 16px, porque el detalle no sobrevive a ese tamaño. Se
    # usa la misma fórmula que el icono de iOS —marca blanca sobre el azul de
    # marca, opaco— que a 16px sigue leyéndose como un balón con la "iD".
    # El margen baja con el tamaño: a 16px cada píxel cuenta y el aro del balón
    # ya se come varios, así que va casi a sangre. A 32px sí cabe aire.
    for lado, margen in ((16, 0.02), (32, 0.08)):
        guardar(cuadrado(iso_blanco, lado, margen=margen, fondo=AZUL_MARCA),
                f'favicon-{lado}x{lado}.png')

    # iOS ignora la transparencia y rellena de negro: fondo azul de marca y
    # el isotipo en blanco encima.
    guardar(cuadrado(iso_blanco, 180, margen=0.14, fondo=AZUL_MARCA), 'apple-touch-icon.png')

    # Imagen para compartir (Open Graph pide 1200x630). Lleva el LOCKUP, no
    # solo el isotipo: en una miniatura de WhatsApp o Twitter, un balón suelto
    # no dice de quién es el enlace. Con el nombre sí.
    og = Image.new('RGBA', (1200, 630), AZUL_MARCA)
    marca = recortar(cargar('horiz_blanco'))
    marca.thumbnail((860, 420), Image.LANCZOS)
    og.paste(marca, ((1200 - marca.width) // 2, (630 - marca.height) // 2), marca)
    guardar(og.convert('RGB').convert('RGBA'), 'og-image.png')

    print()


if __name__ == '__main__':
    main()
