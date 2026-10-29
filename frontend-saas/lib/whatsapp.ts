// Enlaces a WhatsApp del sitio público; sirven en el servidor y en el navegador.

/** "3508809878" → "573508809878" para wa.me. */
export function digitosWhatsapp(valor: string) {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 10 && digitos.startsWith("3") ? `57${digitos}` : digitos;
}

export function enlaceWhatsapp(numero: string, texto = "Hola, quiero hacer una consulta jurídica.") {
  return `https://wa.me/${digitosWhatsapp(numero)}?text=${encodeURIComponent(texto)}`;
}
