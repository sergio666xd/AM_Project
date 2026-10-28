from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import Usuario
from app.modulos.judicial import terminos
from app.modulos.judicial.esquemas import CalcularTermino, PeriodoInhabil, Termino
from app.nucleo.errores import SinPermiso


def calcular_termino(usuario: Usuario, datos: CalcularTermino) -> Termino:
    if politicas.es_cliente(usuario):
        raise SinPermiso("La calculadora de términos es para el equipo de la firma.")
    resultado = terminos.calcular(datos.notificacion, datos.dias)
    return Termino(
        notificacion=resultado.notificacion,
        dias=resultado.dias,
        inicia=resultado.inicia,
        vence=resultado.vence,
        inhabiles=[PeriodoInhabil(desde=p.desde, hasta=p.hasta, motivo=p.motivo) for p in resultado.inhabiles],
    )
