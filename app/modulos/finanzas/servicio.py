"""Casos de uso de finanzas: cobrar, registrar pagos y llevar el estado de cuenta.

Reglas del negocio (plan, Fase 0):
- Pesos colombianos sin centavos. Se permiten pagos parciales y un pago puede
  abonarse a varias cuentas; lo que sobra queda a favor del cliente.
- El saldo nunca se guarda: sale del total, los ajustes y los pagos abonados.
- Una cuenta emitida no se edita ni se borra: se anula con motivo (si no tiene
  pagos activos) o se corrige con un ajuste. Un pago no se borra: se revierte.
- Al emitir una cuenta o registrar un pago, el cliente recibe el PDF en su
  correo, aunque haya apagado los avisos ordinarios.
"""

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.modulos.bandeja.esquemas import ProcesoBreve
from app.modulos.clientes.politicas import filtro_clientes_visibles
from app.modulos.expedientes.modelos import Proceso, ProcesoCliente
from app.modulos.expedientes.politicas import _rol, filtro_procesos_visibles
from app.modulos.finanzas import correo
from app.modulos.finanzas.esquemas import (
    AjusteNuevo,
    AjusteVista,
    AplicacionDePago,
    AplicacionNueva,
    AplicacionVista,
    CambioCuenta,
    ConfiguracionFinanzas,
    CuentaBreve,
    CuentaNueva,
    DetalleCuenta,
    EntregaVista,
    EstadoCobro,
    EstadoDeCuenta,
    FiltroCobros,
    Linea,
    LineaNueva,
    ListaCuentas,
    ListaPagos,
    PagoNuevo,
    PagoVista,
    ResumenCobros,
    TotalesEstado,
)
from app.modulos.finanzas.modelos import (
    AjusteCuentaCobro,
    AplicacionPago,
    ConfiguracionCorreoFinanciero,
    CuentaCobro,
    CuentaCobroLinea,
    PagoFinanciero,
    ReversionPago,
)
from app.modulos.finanzas.politicas import es_admin, filtro_cuentas, filtro_pagos, gestiona_cobros
from app.modulos.finanzas.repositorio import RepositorioFinanzas
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.modulos.tareas.esquemas import PersonaBreve
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado, SinPermiso
from app.nucleo.zona_horaria import a_colombia, fin_del_dia_utc, inicio_del_dia_utc, utc_ahora

logger = logging.getLogger(__name__)

ACREEDORES = {RolUsuario.ABOGADO_ADMIN, RolUsuario.ADMIN}
CERO = Decimal("0")
FILTROS: dict[str, set[str]] = {
    "por_cobrar": {"pendiente", "parcial"},
    "pagadas": {"pagada"},
    "borradores": {"borrador"},
    "anuladas": {"anulada"},
}


def _pesos(valor: Decimal | int | None) -> int:
    return int(Decimal(valor or 0).quantize(Decimal("1")))


def _hoy() -> date:
    return a_colombia(utc_ahora()).date()


def _dia(valor) -> date | None:
    return a_colombia(valor).date() if valor else None


def _persona_snapshot(respaldo: dict, usuario_id: int | None) -> PersonaBreve:
    return PersonaBreve(id=int(respaldo.get("id") or usuario_id or 0), nombre=str(respaldo.get("nombre") or "Sin nombre"))


@dataclass
class Saldo:
    pagado: Decimal
    ajustes: Decimal

    def saldo(self, cuenta: CuentaCobro) -> Decimal:
        if cuenta.estado in {"BORRADOR", "ANULADA"}:
            return CERO
        return max(CERO, Decimal(cuenta.total) + self.ajustes - self.pagado)


class ServicioFinanzas:
    def __init__(self, db: Session, repositorio: RepositorioFinanzas):
        self._db = db
        self._repo = repositorio

    # ── Permisos y vínculos ──────────────────────────────────────────────

    def _cobrador(self, usuario: Usuario) -> None:
        if not gestiona_cobros(usuario):
            raise SinPermiso("Los cobros los lleva la administración de la firma.")

    def _cliente(self, usuario: Usuario, cliente_id: int) -> Usuario:
        cliente = self._db.scalar(select(Usuario).where(
            Usuario.id == cliente_id, Usuario.rol == RolUsuario.CLIENTE, filtro_clientes_visibles(usuario)))
        if cliente is None:
            raise NoEncontrado("No encontramos ese cliente entre los suyos.")
        return cliente

    def _proceso(self, usuario: Usuario, cliente: Usuario, proceso_id: int | None) -> Proceso | None:
        if proceso_id is None:
            return None
        proceso = self._db.scalar(select(Proceso).where(Proceso.id == proceso_id, filtro_procesos_visibles(usuario)))
        if proceso is None:
            raise NoEncontrado("No encontramos ese proceso.")
        vinculado = self._db.scalar(select(ProcesoCliente.proceso_id).where(
            ProcesoCliente.proceso_id == proceso.id, ProcesoCliente.cliente_id == cliente.id))
        if vinculado is None:
            raise DatosInvalidos("El cliente no es parte de ese proceso.", campos={"proceso_id": "Elija un proceso del cliente."})
        return proceso

    def _acreedor(self, usuario: Usuario, cliente: Usuario, proceso: Proceso | None) -> Usuario:
        """Quién cobra: el abogado que registra o, si es ADMIN, el responsable del proceso."""
        if es_admin(usuario):
            if proceso is not None and proceso.abogado is not None and _rol(proceso.abogado) in ACREEDORES:
                return proceso.abogado
            return usuario
        if proceso is not None and proceso.abogado_id != usuario.id:
            raise SinPermiso("Solo quien lleva el proceso puede cobrar en él.")
        if proceso is None:
            propio = cliente.creado_por_abogado_id == usuario.id or self._db.scalar(
                select(ProcesoCliente.proceso_id).join(Proceso, Proceso.id == ProcesoCliente.proceso_id)
                .where(ProcesoCliente.cliente_id == cliente.id, Proceso.abogado_id == usuario.id)
            ) is not None
            if not propio:
                raise SinPermiso("Solo puede cobrarles a los clientes de sus procesos.")
        return usuario

    def _cuenta(self, usuario: Usuario, cuenta_id: int, *, bloquear: bool = False) -> CuentaCobro:
        cuenta = self._repo.cuenta(cuenta_id, filtro_cuentas(usuario), bloquear=bloquear)
        if cuenta is None:
            raise NoEncontrado("No encontramos esa cuenta de cobro.")
        return cuenta

    def _pago(self, usuario: Usuario, pago_id: int, *, bloquear: bool = False) -> PagoFinanciero:
        pago = self._repo.pago(pago_id, filtro_pagos(usuario), bloquear=bloquear)
        if pago is None:
            raise NoEncontrado("No encontramos ese pago.")
        return pago

    # ── Vistas ───────────────────────────────────────────────────────────

    def _saldos(self, cuentas: list[CuentaCobro]) -> dict[int, Saldo]:
        ids = [c.id for c in cuentas]
        pagado = self._repo.pagado_por_cuenta(ids)
        ajustes = self._repo.ajustes_por_cuenta(ids)
        return {i: Saldo(pagado.get(i, CERO), ajustes.get(i, CERO)) for i in ids}

    def _estado(self, cuenta: CuentaCobro, s: Saldo) -> EstadoCobro:
        if cuenta.estado == "BORRADOR":
            return "borrador"
        if cuenta.estado == "ANULADA":
            return "anulada"
        if s.saldo(cuenta) == 0:
            return "pagada"
        return "parcial" if s.pagado > 0 else "pendiente"

    def _breve(self, cuenta: CuentaCobro, s: Saldo, procesos: dict[int, Proceso]) -> CuentaBreve:
        estado = self._estado(cuenta, s)
        vence = _dia(cuenta.fecha_vencimiento)
        proceso = procesos.get(cuenta.proceso_id) if cuenta.proceso_id else None
        return CuentaBreve(
            id=cuenta.id,
            numero=cuenta.numero,
            concepto=cuenta.concepto,
            estado=estado,
            vencida=estado in {"pendiente", "parcial"} and vence is not None and vence < _hoy(),
            cliente=_persona_snapshot(cuenta.cliente_snapshot or {}, cuenta.cliente_id),
            abogado=_persona_snapshot(cuenta.abogado_snapshot or {}, cuenta.abogado_id),
            proceso=ProcesoBreve(id=proceso.id, nombre=proceso.nombre) if proceso else None,
            total=_pesos(cuenta.total),
            pagado=_pesos(s.pagado),
            ajustes=_pesos(s.ajustes),
            saldo=_pesos(s.saldo(cuenta)),
            emitida_en=cuenta.fecha_emision,
            vence_el=vence,
            creada_en=cuenta.created_at,
        )

    def _procesos(self, ids: set[int | None]) -> dict[int, Proceso]:
        ids = {i for i in ids if i}
        if not ids:
            return {}
        return {p.id: p for p in self._db.scalars(select(Proceso).where(Proceso.id.in_(ids))).all()}

    def _breves(self, cuentas: list[CuentaCobro]) -> list[CuentaBreve]:
        saldos = self._saldos(cuentas)
        procesos = self._procesos({c.proceso_id for c in cuentas})
        return [self._breve(c, saldos[c.id], procesos) for c in cuentas]

    def _detalle(self, usuario: Usuario, cuenta: CuentaCobro) -> DetalleCuenta:
        breve = self._breves([cuenta])[0]
        por = {u.id: u.nombre_completo for u in self._db.scalars(select(Usuario).where(
            Usuario.id.in_({a.creado_por_id for a in self._repo.ajustes(cuenta.id) if a.creado_por_id}))).all()}
        return DetalleCuenta(
            **breve.model_dump(),
            lineas=[Linea(descripcion=l.descripcion, cantidad=_pesos(l.cantidad), valor_unitario=_pesos(l.valor_unitario),
                          total=_pesos(l.total)) for l in cuenta.lineas],
            aplicaciones=[AplicacionVista(id=a.id, pago_id=p.id, numero_recibo=p.numero_recibo, importe=_pesos(a.importe),
                                          pagado_el=_dia(p.fecha_pago), metodo=p.metodo.lower(), revertido=p.estado != "REGISTRADO")
                          for a, p in self._repo.aplicaciones_de_cuenta(cuenta.id)],
            ajustes_detalle=[AjusteVista(id=a.id, tipo="cargo" if a.tipo == "DEBITO" else "descuento", importe=_pesos(a.importe),
                                         motivo=a.motivo, creado_en=a.created_at, por=por.get(a.creado_por_id))
                             for a in self._repo.ajustes(cuenta.id)],
            entregas=[self._entrega(e) for e in self._repo.entregas(cuenta_id=cuenta.id)] if gestiona_cobros(usuario) else [],
            anulada_en=cuenta.anulada_en,
            motivo_anulacion=cuenta.motivo_anulacion,
        )

    @staticmethod
    def _entrega(entrega) -> EntregaVista:
        return EntregaVista(id=entrega.id, destinatario=entrega.destinatario,
                            estado="enviado" if entrega.estado == "ENVIADO" else "error",
                            error=entrega.error, creado_en=entrega.created_at)

    def _pagos(self, pagos: list[PagoFinanciero]) -> list[PagoVista]:
        ids = [p.id for p in pagos]
        aplicaciones = self._repo.aplicaciones_de_pagos(ids)
        reversiones = self._repo.reversiones(ids)
        procesos = self._procesos({p.proceso_id for p in pagos})
        salida = []
        for pago in pagos:
            propias = aplicaciones.get(pago.id, [])
            aplicado = sum((Decimal(a.importe) for a, _ in propias), CERO)
            revertido = pago.estado != "REGISTRADO"
            proceso = procesos.get(pago.proceso_id) if pago.proceso_id else None
            salida.append(PagoVista(
                id=pago.id,
                numero_recibo=pago.numero_recibo,
                cliente=_persona_snapshot(pago.cliente_snapshot or {}, pago.cliente_id),
                abogado=_persona_snapshot(pago.abogado_snapshot or {}, pago.abogado_id),
                proceso=ProcesoBreve(id=proceso.id, nombre=proceso.nombre) if proceso else None,
                importe=_pesos(pago.importe),
                aplicado=_pesos(aplicado),
                disponible=0 if revertido else _pesos(Decimal(pago.importe) - aplicado),
                metodo=pago.metodo.lower(),
                referencia=pago.referencia,
                pagado_el=_dia(pago.fecha_pago),
                revertido=revertido,
                motivo_reversion=reversiones[pago.id].motivo if pago.id in reversiones else None,
                registrado_en=pago.created_at,
                aplicaciones=[AplicacionDePago(cuenta_id=c.id, numero=c.numero, concepto=c.concepto, importe=_pesos(a.importe))
                              for a, c in propias],
            ))
        return salida

    # ── Cuentas de cobro ─────────────────────────────────────────────────

    def listar(self, usuario: Usuario, filtro: FiltroCobros, cliente_id: int | None = None,
               proceso_id: int | None = None) -> ListaCuentas:
        if not gestiona_cobros(usuario) and _rol(usuario) != RolUsuario.CLIENTE:
            raise SinPermiso("Los cobros los lleva la administración de la firma.")
        breves = self._breves(self._repo.cuentas(filtro_cuentas(usuario), cliente_id=cliente_id, proceso_id=proceso_id))
        emitidas = [c for c in breves if c.estado in {"pendiente", "parcial"}]
        vencidas = [c for c in emitidas if c.vencida]
        inicio_mes = _hoy().replace(day=1)
        cobrado = sum(
            (Decimal(p.importe) for p in self._repo.pagos(filtro_pagos(usuario), cliente_id=cliente_id)
             if p.estado == "REGISTRADO" and _dia(p.fecha_pago) >= inicio_mes
             and (proceso_id is None or p.proceso_id == proceso_id)),
            CERO,
        )
        resumen = ResumenCobros(
            por_cobrar=sum(c.saldo for c in emitidas),
            vencido=sum(c.saldo for c in vencidas),
            cuentas_vencidas=len(vencidas),
            cobrado_mes=_pesos(cobrado),
            borradores=sum(1 for c in breves if c.estado == "borrador"),
        )
        if filtro == "vencidas":
            items = vencidas
        elif filtro == "todas":
            items = breves
        else:
            items = [c for c in breves if c.estado in FILTROS[filtro]]
        return ListaCuentas(items=items, resumen=resumen)

    def detalle(self, usuario: Usuario, cuenta_id: int) -> DetalleCuenta:
        return self._detalle(usuario, self._cuenta(usuario, cuenta_id))

    def _lineas(self, cuenta: CuentaCobro, lineas: list[LineaNueva]) -> None:
        cuenta.lineas.clear()
        total = CERO
        for linea in lineas:
            descripcion = linea.descripcion.strip()
            if not descripcion:
                raise DatosInvalidos("Escriba qué se cobra en cada línea.", campos={"lineas": "Falta la descripción."})
            subtotal = Decimal(linea.cantidad) * Decimal(linea.valor_unitario)
            total += subtotal
            cuenta.lineas.append(CuentaCobroLinea(descripcion=descripcion, cantidad=Decimal(linea.cantidad),
                                                  valor_unitario=Decimal(linea.valor_unitario), total=subtotal))
        if total >= Decimal("1000000000000"):
            raise DatosInvalidos("El total supera el máximo permitido.")
        cuenta.total = total

    @staticmethod
    def _snapshot_cliente(cliente: Usuario) -> dict:
        return {"id": cliente.id, "nombre": cliente.nombre_completo, "email": cliente.email,
                "documento": cliente.numero_documento, "direccion": cliente.direccion, "domicilio": cliente.domicilio}

    @staticmethod
    def _snapshot_abogado(abogado: Usuario) -> dict:
        return {"id": abogado.id, "nombre": abogado.nombre_completo, "email": abogado.email,
                "documento": abogado.numero_documento, "tarjeta_profesional": abogado.tarjeta_profesional}

    def crear(self, usuario: Usuario, datos: CuentaNueva) -> DetalleCuenta:
        self._cobrador(usuario)
        cliente = self._cliente(usuario, datos.cliente_id)
        proceso = self._proceso(usuario, cliente, datos.proceso_id)
        abogado = self._acreedor(usuario, cliente, proceso)
        cuenta = CuentaCobro(
            abogado_id=abogado.id, cliente_id=cliente.id, proceso_id=proceso.id if proceso else None,
            cliente_snapshot=self._snapshot_cliente(cliente), abogado_snapshot=self._snapshot_abogado(abogado),
            concepto=datos.concepto.strip(), moneda="COP", estado="BORRADOR",
            fecha_vencimiento=fin_del_dia_utc(datos.vence_el) if datos.vence_el else None, creado_por_id=usuario.id,
        )
        self._lineas(cuenta, datos.lineas)
        self._db.add(cuenta)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "cuenta_cobro.crear", "cuenta_cobro", cuenta.id,
                                   {"cliente_id": cliente.id, "total": _pesos(cuenta.total)})
        if datos.emitir:
            return self._emitir(usuario, cuenta)
        self._db.commit()
        return self._detalle(usuario, cuenta)

    def cambiar(self, usuario: Usuario, cuenta_id: int, datos: CambioCuenta) -> DetalleCuenta:
        self._cobrador(usuario)
        cuenta = self._cuenta(usuario, cuenta_id, bloquear=True)
        if cuenta.estado != "BORRADOR":
            raise Conflicto("Una cuenta emitida no se edita. Anúlela o agregue un ajuste.")
        cliente = self._db.get(Usuario, cuenta.cliente_id)
        if cliente is None:
            raise Conflicto("El cliente de esta cuenta ya no existe.")
        proceso = self._proceso(usuario, cliente, datos.proceso_id)
        abogado = self._acreedor(usuario, cliente, proceso)
        cuenta.proceso_id = proceso.id if proceso else None
        cuenta.abogado_id = abogado.id
        cuenta.abogado_snapshot = self._snapshot_abogado(abogado)
        cuenta.concepto = datos.concepto.strip()
        cuenta.fecha_vencimiento = fin_del_dia_utc(datos.vence_el) if datos.vence_el else None
        self._lineas(cuenta, datos.lineas)
        registrar_evento_auditoria(self._db, usuario, "cuenta_cobro.editar", "cuenta_cobro", cuenta.id)
        self._db.commit()
        return self._detalle(usuario, cuenta)

    def descartar(self, usuario: Usuario, cuenta_id: int) -> None:
        self._cobrador(usuario)
        cuenta = self._cuenta(usuario, cuenta_id, bloquear=True)
        if cuenta.estado != "BORRADOR":
            raise Conflicto("Solo se descarta un borrador. Una cuenta emitida se anula.")
        registrar_evento_auditoria(self._db, usuario, "cuenta_cobro.descartar", "cuenta_cobro", cuenta.id)
        self._db.delete(cuenta)
        self._db.commit()

    def emitir(self, usuario: Usuario, cuenta_id: int) -> DetalleCuenta:
        self._cobrador(usuario)
        return self._emitir(usuario, self._cuenta(usuario, cuenta_id, bloquear=True))

    def _emitir(self, usuario: Usuario, cuenta: CuentaCobro) -> DetalleCuenta:
        if cuenta.estado != "BORRADOR":
            raise Conflicto("Esta cuenta ya se emitió.")
        if not cuenta.lineas or Decimal(cuenta.total) <= 0:
            raise DatosInvalidos("La cuenta debe tener al menos una línea con valor.")
        cliente = self._db.get(Usuario, cuenta.cliente_id) if cuenta.cliente_id else None
        if cliente is not None:
            cuenta.cliente_snapshot = self._snapshot_cliente(cliente)
        ahora = utc_ahora()
        cuenta.numero = f"CC-{a_colombia(ahora):%Y}-{cuenta.id:05d}"
        cuenta.fecha_emision = ahora
        cuenta.estado = "EMITIDA"
        registrar_evento_auditoria(self._db, usuario, "cuenta_cobro.emitir", "cuenta_cobro", cuenta.id,
                                   {"numero": cuenta.numero, "total": _pesos(cuenta.total)})
        self._db.commit()
        self._enviar_cuenta(usuario, cuenta)
        return self._detalle(usuario, cuenta)

    def anular(self, usuario: Usuario, cuenta_id: int, motivo: str) -> DetalleCuenta:
        self._cobrador(usuario)
        cuenta = self._cuenta(usuario, cuenta_id, bloquear=True)
        if cuenta.estado != "EMITIDA":
            raise Conflicto("Solo se anula una cuenta emitida." if cuenta.estado == "BORRADOR" else "Esta cuenta ya está anulada.")
        if self._saldos([cuenta])[cuenta.id].pagado > 0:
            raise Conflicto("Esta cuenta tiene pagos abonados. Reviértalos antes de anularla.", codigo="tiene_pagos")
        cuenta.estado = "ANULADA"
        cuenta.anulada_en = utc_ahora()
        cuenta.motivo_anulacion = motivo.strip()
        registrar_evento_auditoria(self._db, usuario, "cuenta_cobro.anular", "cuenta_cobro", cuenta.id, {"motivo": cuenta.motivo_anulacion})
        self._db.commit()
        return self._detalle(usuario, cuenta)

    def ajustar(self, usuario: Usuario, cuenta_id: int, datos: AjusteNuevo) -> DetalleCuenta:
        self._cobrador(usuario)
        cuenta = self._cuenta(usuario, cuenta_id, bloquear=True)
        if cuenta.estado != "EMITIDA":
            raise Conflicto("Los ajustes se hacen sobre una cuenta emitida.")
        importe = Decimal(datos.importe)
        if datos.tipo == "descuento" and importe > self._saldos([cuenta])[cuenta.id].saldo(cuenta):
            raise DatosInvalidos("El descuento no puede ser mayor que el saldo.", campos={"importe": "Supera el saldo."})
        ajuste = AjusteCuentaCobro(cuenta_id=cuenta.id, tipo="DEBITO" if datos.tipo == "cargo" else "CREDITO",
                                   importe=importe, motivo=datos.motivo.strip(), creado_por_id=usuario.id)
        self._db.add(ajuste)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "cuenta_cobro.ajuste", "cuenta_cobro", cuenta.id,
                                   {"tipo": datos.tipo, "importe": datos.importe, "motivo": ajuste.motivo})
        self._db.commit()
        return self._detalle(usuario, cuenta)

    def reenviar_cuenta(self, usuario: Usuario, cuenta_id: int) -> EntregaVista:
        self._cobrador(usuario)
        cuenta = self._cuenta(usuario, cuenta_id)
        if cuenta.estado != "EMITIDA":
            raise Conflicto("Solo se envía una cuenta emitida.")
        return self._entrega(self._enviar_cuenta(usuario, cuenta))

    def pdf_cuenta(self, usuario: Usuario, cuenta_id: int) -> tuple[bytes, str]:
        cuenta = self._cuenta(usuario, cuenta_id)
        return correo.pdf_cuenta(self._db, cuenta, self._detalle(usuario, cuenta), self._repo.configuracion()), \
            f"cuenta-de-cobro-{cuenta.numero or f'borrador-{cuenta.id}'}.pdf"

    def _enviar_cuenta(self, usuario: Usuario, cuenta: CuentaCobro):
        detalle = self._detalle(usuario, cuenta)
        return correo.enviar_cuenta(self._db, cuenta, detalle, self._repo.configuracion(), usuario)

    # ── Pagos ────────────────────────────────────────────────────────────

    def pagos(self, usuario: Usuario, cliente_id: int | None = None) -> ListaPagos:
        if not gestiona_cobros(usuario) and _rol(usuario) != RolUsuario.CLIENTE:
            raise SinPermiso("Los cobros los lleva la administración de la firma.")
        return ListaPagos(items=self._pagos(self._repo.pagos(filtro_pagos(usuario), cliente_id=cliente_id)))

    def registrar_pago(self, usuario: Usuario, datos: PagoNuevo) -> PagoVista:
        self._cobrador(usuario)
        if datos.pagado_el > _hoy():
            raise DatosInvalidos("La fecha del pago no puede ser futura.", campos={"pagado_el": "Elija hoy o un día anterior."})
        clave = datos.clave.strip()
        referencia = (datos.referencia or "").strip() or None
        existente = self._repo.pago_por_clave(clave)
        if existente is not None:
            return self._repetido(usuario, existente, datos, referencia)
        cliente = self._cliente(usuario, datos.cliente_id)
        proceso = self._proceso(usuario, cliente, datos.proceso_id)
        abogado = self._acreedor_pago(usuario, cliente, proceso, datos.aplicaciones)
        pago = PagoFinanciero(
            clave_idempotencia=clave, abogado_id=abogado.id, cliente_id=cliente.id, proceso_id=proceso.id if proceso else None,
            abogado_snapshot=self._snapshot_abogado(abogado), cliente_snapshot=self._snapshot_cliente(cliente),
            importe=Decimal(datos.importe), moneda="COP", origen="MANUAL", metodo=datos.metodo.upper(), referencia=referencia,
            estado="REGISTRADO", fecha_pago=inicio_del_dia_utc(datos.pagado_el), registrado_por_id=usuario.id,
        )
        try:
            with self._db.begin_nested():
                self._db.add(pago)
                self._db.flush()
        except IntegrityError:
            existente = self._repo.pago_por_clave(clave)
            if existente is None:
                raise
            return self._repetido(usuario, existente, datos, referencia)
        pago.numero_recibo = f"RP-{a_colombia(pago.fecha_pago):%Y}-{pago.id:05d}"
        self._aplicar(usuario, pago, datos.aplicaciones)
        registrar_evento_auditoria(self._db, usuario, "pago.registrar", "pago_financiero", pago.id,
                                   {"cliente_id": cliente.id, "importe": datos.importe, "metodo": pago.metodo})
        self._db.commit()
        correo.enviar_recibo(self._db, pago, self._pagos([pago])[0], self._repo.configuracion(), usuario,
                             saldo=self._saldo_cliente(pago))
        return self._pagos([pago])[0]

    def _repetido(self, usuario: Usuario, pago: PagoFinanciero, datos: PagoNuevo, referencia: str | None) -> PagoVista:
        """El mismo pago enviado dos veces (doble clic, red lenta) no se duplica."""
        igual = (pago.cliente_id == datos.cliente_id and pago.proceso_id == datos.proceso_id
                 and Decimal(pago.importe) == Decimal(datos.importe) and pago.metodo == datos.metodo.upper()
                 and pago.referencia == referencia)
        if not igual or self._repo.pago(pago.id, filtro_pagos(usuario)) is None:
            raise Conflicto("Ese pago ya se registró con otros datos. Recargue la página.", codigo="clave_repetida")
        return self._pagos([pago])[0]

    def _acreedor_pago(self, usuario: Usuario, cliente: Usuario, proceso: Proceso | None,
                       aplicaciones: list[AplicacionNueva]) -> Usuario:
        if es_admin(usuario) and proceso is None and aplicaciones:
            cuenta = self._repo.cuenta(aplicaciones[0].cuenta_id, filtro_cuentas(usuario))
            abogado = self._db.get(Usuario, cuenta.abogado_id) if cuenta and cuenta.abogado_id else None
            if abogado is not None:
                return abogado
        return self._acreedor(usuario, cliente, proceso)

    def _aplicar(self, usuario: Usuario, pago: PagoFinanciero, aplicaciones: list[AplicacionNueva]) -> None:
        if not aplicaciones:
            return
        if len({a.cuenta_id for a in aplicaciones}) != len(aplicaciones):
            raise DatosInvalidos("Cada cuenta va una sola vez.")
        ya = sum((Decimal(a.importe) for a, _ in self._repo.aplicaciones_de_pagos([pago.id]).get(pago.id, [])), CERO)
        disponible = Decimal(pago.importe) - ya
        if sum(Decimal(a.importe) for a in aplicaciones) > disponible:
            raise DatosInvalidos("Lo abonado supera el valor del pago.", campos={"aplicaciones": "Revise los valores."})
        for aplicacion in aplicaciones:
            cuenta = self._repo.cuenta(aplicacion.cuenta_id, filtro_cuentas(usuario), bloquear=True)
            if cuenta is None:
                raise NoEncontrado("No encontramos una de las cuentas.")
            if cuenta.estado != "EMITIDA" or cuenta.cliente_id != pago.cliente_id or cuenta.abogado_id != pago.abogado_id:
                raise DatosInvalidos(f"La cuenta {cuenta.numero or cuenta.id} no es de este cliente o no está emitida.")
            if Decimal(aplicacion.importe) > self._saldos([cuenta])[cuenta.id].saldo(cuenta):
                raise DatosInvalidos(f"El abono a {cuenta.numero} supera su saldo.", campos={"aplicaciones": "Supera el saldo."})
            self._db.add(AplicacionPago(pago_id=pago.id, cuenta_id=cuenta.id, importe=Decimal(aplicacion.importe),
                                        creado_por_id=usuario.id))
            self._db.flush()

    def abonar(self, usuario: Usuario, pago_id: int, aplicaciones: list[AplicacionNueva]) -> PagoVista:
        self._cobrador(usuario)
        pago = self._pago(usuario, pago_id, bloquear=True)
        if pago.estado != "REGISTRADO":
            raise Conflicto("Un pago revertido no se abona.")
        if not aplicaciones:
            raise DatosInvalidos("Elija al menos una cuenta.")
        self._aplicar(usuario, pago, aplicaciones)
        registrar_evento_auditoria(self._db, usuario, "pago.abonar", "pago_financiero", pago.id,
                                   {"aplicaciones": [a.model_dump() for a in aplicaciones]})
        self._db.commit()
        return self._pagos([pago])[0]

    def revertir(self, usuario: Usuario, pago_id: int, motivo: str) -> PagoVista:
        self._cobrador(usuario)
        pago = self._pago(usuario, pago_id, bloquear=True)
        if pago.estado != "REGISTRADO":
            raise Conflicto("Este pago ya está revertido.")
        self._db.add(ReversionPago(pago_id=pago.id, motivo=motivo.strip(), revertido_por_id=usuario.id))
        pago.estado = "REVERTIDO"
        registrar_evento_auditoria(self._db, usuario, "pago.revertir", "pago_financiero", pago.id, {"motivo": motivo.strip()})
        self._db.commit()
        return self._pagos([pago])[0]

    def reenviar_recibo(self, usuario: Usuario, pago_id: int) -> EntregaVista:
        self._cobrador(usuario)
        pago = self._pago(usuario, pago_id)
        if pago.estado != "REGISTRADO":
            raise Conflicto("Un pago revertido no se envía.")
        return self._entrega(correo.enviar_recibo(self._db, pago, self._pagos([pago])[0], self._repo.configuracion(), usuario,
                                                  saldo=self._saldo_cliente(pago)))

    def pdf_recibo(self, usuario: Usuario, pago_id: int) -> tuple[bytes, str]:
        pago = self._pago(usuario, pago_id)
        return correo.pdf_recibo(self._db, self._pagos([pago])[0], pago, self._repo.configuracion()), \
            f"recibo-{pago.numero_recibo or pago.id}.pdf"

    def _saldo_cliente(self, pago: PagoFinanciero) -> int:
        """Lo que el cliente aún le debe a ese abogado, para contárselo en el recibo."""
        cuentas = [c for c in self._repo.cuentas(CuentaCobro.abogado_id == pago.abogado_id, cliente_id=pago.cliente_id)
                   if c.estado == "EMITIDA"]
        saldos = self._saldos(cuentas)
        return _pesos(sum((saldos[c.id].saldo(c) for c in cuentas), CERO))

    # ── Estado de cuenta ─────────────────────────────────────────────────

    def estado_de_cuenta(self, usuario: Usuario, cliente_id: int | None) -> EstadoDeCuenta:
        if _rol(usuario) == RolUsuario.CLIENTE:
            cliente = usuario
        else:
            self._cobrador(usuario)
            if cliente_id is None:
                raise DatosInvalidos("Elija el cliente.", campos={"cliente_id": "Falta el cliente."})
            cliente = self._db.get(Usuario, cliente_id)
            if cliente is None or (not es_admin(usuario) and self._db.scalar(
                    select(Usuario.id).where(Usuario.id == cliente_id, filtro_clientes_visibles(usuario))) is None):
                raise NoEncontrado("No encontramos ese cliente entre los suyos.")
        cuentas = [c for c in self._breves(self._repo.cuentas(filtro_cuentas(usuario), cliente_id=cliente.id)) if c.estado != "borrador"]
        pagos = self._pagos(self._repo.pagos(filtro_pagos(usuario), cliente_id=cliente.id))
        vigentes = [c for c in cuentas if c.estado != "anulada"]
        totales = TotalesEstado(
            cobrado=sum(c.total + c.ajustes for c in vigentes),
            pagado=sum(p.importe for p in pagos if not p.revertido),
            saldo=sum(c.saldo for c in vigentes),
            vencido=sum(c.saldo for c in vigentes if c.vencida),
            a_favor=sum(p.disponible for p in pagos),
        )
        config = self._repo.configuracion()
        return EstadoDeCuenta(cliente=PersonaBreve(id=cliente.id, nombre=cliente.nombre_completo),
                              cuentas=cuentas, pagos=pagos, totales=totales,
                              datos_pago=(config.datos_pago or None) if config else None)

    def pdf_estado(self, usuario: Usuario, cliente_id: int | None) -> tuple[bytes, str]:
        estado = self.estado_de_cuenta(usuario, cliente_id)
        return correo.pdf_estado(self._db, estado, self._repo.configuracion()), f"estado-de-cuenta-{_hoy():%Y-%m-%d}.pdf"

    # ── Configuración (ADMIN) ────────────────────────────────────────────

    def configuracion(self, usuario: Usuario) -> ConfiguracionFinanzas:
        if not es_admin(usuario):
            raise SinPermiso("La configuración financiera es de la administración.")
        config = self._repo.configuracion()
        if config is None:
            return ConfiguracionFinanzas(remitente_nombre="Alejandra Muñoz | Abogada y Asociados")
        return ConfiguracionFinanzas(remitente_nombre=config.remitente_nombre, remitente_email=config.remitente_email,
                                     reply_to=config.reply_to, datos_pago=config.datos_pago, nota_documentos=config.nota_documentos)

    def guardar_configuracion(self, usuario: Usuario, datos: ConfiguracionFinanzas) -> ConfiguracionFinanzas:
        if not es_admin(usuario):
            raise SinPermiso("La configuración financiera es de la administración.")
        config = self._repo.configuracion()
        if config is None:
            config = ConfiguracionCorreoFinanciero(id=1)
            self._db.add(config)
        limpio = {k: (v.strip() or None) if isinstance(v, str) else v for k, v in datos.model_dump().items()}
        for campo, valor in limpio.items():
            setattr(config, campo, valor)
        config.remitente_nombre = limpio["remitente_nombre"] or "Alejandra Muñoz | Abogada y Asociados"
        config.actualizado_por_id = usuario.id
        registrar_evento_auditoria(self._db, usuario, "finanzas.configuracion", "configuracion_correo_financiero", 1)
        self._db.commit()
        return self.configuracion(usuario)
