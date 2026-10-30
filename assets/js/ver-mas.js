// «Ver más notas»: recorta la lista a las destacadas y el botón la abre y la
// cierra. Sin este script la lista sale completa y el botón no aparece.
document.querySelectorAll('[data-ver-mas]').forEach(function (lista) {
  var boton = document.querySelector('[aria-controls="' + lista.id + '"]');
  if (!boton) return;
  lista.classList.add('is-recortada');
  boton.hidden = false;
  boton.addEventListener('click', function () {
    var abierta = lista.classList.toggle('is-recortada') === false;
    boton.setAttribute('aria-expanded', String(abierta));
    boton.textContent = abierta ? boton.dataset.menos : boton.dataset.mas;
  });
});
