"""Plantillas de etapas: la firma define por qué etapas pasa cada tipo de proceso.

Las consulta todo el equipo (para elegir la de un proceso); las editan la
administración y la abogada directora, como el glosario. Una etapa que algún
proceso ya usó no se borra, se desactiva, para que el historial siga leyéndose.
"""

from sqlalchemy.orm import Session

from app.audit import registrar_evento_auditoria
from app.models import EtapaPlantilla, PlantillaEtapas
from app.modulos.etapas.esquemas import (
    DatosPlantillaEtapas,
    EtapaDePlantilla,
    ListaPlantillasEtapas,
    PlantillaDeEtapas,
)
from app.modulos.etapas.linea import plantilla_predeterminada
from app.modulos.etapas.repositorio import RepositorioEtapas
from app.modulos.expedientes import politicas
from app.modulos.identidad.modelos import RolUsuario, Usuario
from app.nucleo.errores import Conflicto, DatosInvalidos, NoEncontrado, SinPermiso

EDITORES = {RolUsuario.ADMIN.value, RolUsuario.ABOGADO_ADMIN.value}


def _rol(usuario: Usuario) -> str:
    return getattr(usuario.rol, "value", usuario.rol)


class ServicioEtapas:
    def __init__(self, db: Session, repositorio: RepositorioEtapas):
        self._db = db
        self._repo = repositorio

    def listar(self, usuario: Usuario, todas: bool = False) -> ListaPlantillasEtapas:
        if politicas.es_cliente(usuario):
            raise SinPermiso("Las plantillas de etapas son para el equipo de la firma.")
        predeterminada = plantilla_predeterminada(self._db)
        self._db.commit()
        plantillas = self._repo.plantillas(solo_activas=not (todas and _rol(usuario) in EDITORES))
        por_plantilla = self._repo.procesos_por_plantilla()
        por_etapa = self._repo.procesos_por_etapa()
        return ListaPlantillasEtapas(items=[
            self._vista(p, por_plantilla, por_etapa, predeterminada.id) for p in plantillas
        ])

    def crear(self, usuario: Usuario, datos: DatosPlantillaEtapas) -> PlantillaDeEtapas:
        self._exigir_editor(usuario)
        actual = plantilla_predeterminada(self._db)
        plantilla = PlantillaEtapas(nombre=datos.nombre, descripcion=datos.descripcion, activa=datos.activa)
        self._db.add(plantilla)
        self._aplicar(plantilla, datos, actual)
        self._db.flush()
        registrar_evento_auditoria(self._db, usuario, "etapas.plantilla.crear", "plantilla_etapas", plantilla.id)
        self._db.commit()
        return self._detalle(plantilla.id)

    def editar(self, usuario: Usuario, plantilla_id: int, datos: DatosPlantillaEtapas) -> PlantillaDeEtapas:
        self._exigir_editor(usuario)
        actual = plantilla_predeterminada(self._db)
        plantilla = self._plantilla(plantilla_id)
        if plantilla.id == actual.id and not (datos.predeterminada and datos.activa):
            raise Conflicto(
                "Esta es la plantilla que toman los procesos nuevos. Marque otra como predeterminada antes de quitarle ese papel o desactivarla.",
                codigo="plantilla_predeterminada",
            )
        plantilla.nombre, plantilla.descripcion, plantilla.activa = datos.nombre, datos.descripcion, datos.activa
        self._aplicar(plantilla, datos, actual)
        registrar_evento_auditoria(self._db, usuario, "etapas.plantilla.editar", "plantilla_etapas", plantilla.id)
        self._db.commit()
        return self._detalle(plantilla.id)

    def eliminar(self, usuario: Usuario, plantilla_id: int) -> None:
        self._exigir_editor(usuario)
        plantilla = self._plantilla(plantilla_id)
        if plantilla.predeterminada:
            raise Conflicto("La plantilla predeterminada no se puede borrar.", codigo="plantilla_predeterminada")
        if self._repo.usa_plantilla(plantilla.id) or self._repo.etapas_usadas([e.id for e in plantilla.etapas]):
            raise Conflicto("Hay procesos que usan o usaron esta plantilla. Desactívela en lugar de borrarla.", codigo="plantilla_en_uso")
        self._db.delete(plantilla)
        registrar_evento_auditoria(self._db, usuario, "etapas.plantilla.eliminar", "plantilla_etapas", plantilla_id)
        self._db.commit()

    # ---- Internos ----------------------------------------------------------

    def _aplicar(self, plantilla: PlantillaEtapas, datos: DatosPlantillaEtapas, actual: PlantillaEtapas) -> None:
        if not any(e.activa for e in datos.etapas):
            raise DatosInvalidos("La plantilla necesita al menos una etapa activa.", campos={"etapas": "Deje al menos una etapa activa."})
        nombres = [e.nombre.casefold() for e in datos.etapas]
        repetido = next((e.nombre for e in datos.etapas if nombres.count(e.nombre.casefold()) > 1), None)
        if repetido:
            raise DatosInvalidos(f"La etapa «{repetido}» está dos veces.", campos={"etapas": "Cada etapa debe tener un nombre distinto."})
        if datos.predeterminada and not datos.activa:
            raise DatosInvalidos("La plantilla predeterminada debe estar activa.", campos={"activa": "Actívela o no la marque como predeterminada."})

        existentes = {e.id: e for e in plantilla.etapas}
        ajenas = [e.id for e in datos.etapas if e.id is not None and e.id not in existentes]
        if ajenas:
            raise DatosInvalidos("Una de las etapas no pertenece a esta plantilla.", campos={"etapas": "Recargue la página e intente de nuevo."})
        enviadas = {e.id for e in datos.etapas if e.id is not None}
        faltantes = [e for i, e in existentes.items() if i not in enviadas]
        usadas = self._repo.etapas_usadas([e.id for e in faltantes])
        orden = 0
        for dato in datos.etapas:
            etapa = existentes.get(dato.id) if dato.id else None
            if etapa is None:
                etapa = EtapaPlantilla()
                plantilla.etapas.append(etapa)
            etapa.nombre, etapa.explicacion, etapa.activa, etapa.orden = dato.nombre, dato.explicacion, dato.activa, orden
            orden += 1
        # Las que se quitaron van al final: borradas si nadie las usó, desactivadas si sí.
        for etapa in faltantes:
            if etapa.id in usadas:
                etapa.activa, etapa.orden = False, orden
                orden += 1
            else:
                plantilla.etapas.remove(etapa)

        if datos.predeterminada and plantilla is not actual:
            actual.predeterminada = False
            plantilla.predeterminada = True

    def _vista(self, plantilla: PlantillaEtapas, por_plantilla: dict, por_etapa: dict, predeterminada_id: int) -> PlantillaDeEtapas:
        procesos = por_plantilla.get(plantilla.id, 0) + (por_plantilla.get(None, 0) if plantilla.id == predeterminada_id else 0)
        return PlantillaDeEtapas(
            id=plantilla.id, nombre=plantilla.nombre, descripcion=plantilla.descripcion, activa=plantilla.activa,
            predeterminada=plantilla.id == predeterminada_id, procesos=procesos, actualizada_en=plantilla.updated_at,
            etapas=[
                EtapaDePlantilla(id=e.id, nombre=e.nombre, explicacion=e.explicacion, activa=e.activa, procesos=por_etapa.get(e.id, 0))
                for e in sorted(plantilla.etapas, key=lambda e: (e.orden, e.id))
            ],
        )

    def _detalle(self, plantilla_id: int) -> PlantillaDeEtapas:
        self._db.expire_all()
        predeterminada = plantilla_predeterminada(self._db)
        return self._vista(self._plantilla(plantilla_id), self._repo.procesos_por_plantilla(), self._repo.procesos_por_etapa(), predeterminada.id)

    def _plantilla(self, plantilla_id: int) -> PlantillaEtapas:
        plantilla = self._repo.plantilla(plantilla_id)
        if plantilla is None:
            raise NoEncontrado("Esa plantilla de etapas no existe.", codigo="plantilla_no_existe")
        return plantilla

    @staticmethod
    def _exigir_editor(usuario: Usuario) -> None:
        if _rol(usuario) not in EDITORES:
            raise SinPermiso("Solo la administración y la abogada directora editan las plantillas de etapas.")
