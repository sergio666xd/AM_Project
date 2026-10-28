from datetime import timedelta

from app import models
from app.modulos.agenda.ics import EventoIcs, calendario
from app.nucleo.zona_horaria import a_colombia
from app.timezone import utc_ahora

H = {"X-AM-Solicitud": "1"}


def _datos(sesion_bd, abogada, crear_proceso, crear_usuario):
    proceso = crear_proceso(abogada, "Restitución Cardona")
    ajeno = crear_proceso(crear_usuario(), "Ajeno")
    archivado = crear_proceso(abogada, "Archivado", archivado=True)
    en_dos_dias = utc_ahora() + timedelta(days=2)
    sesion_bd.add_all([
        models.EventoAgenda(titulo="Audiencia inicial", tipo="AUDIENCIA", fecha_inicio=en_dos_dias,
                            fecha_fin=en_dos_dias + timedelta(hours=2), proceso_id=proceso.id, responsable_id=abogada.id),
        models.EventoAgenda(titulo="Reunión cancelada", tipo="REUNION", estado="CANCELADO",
                            fecha_inicio=en_dos_dias + timedelta(hours=3), proceso_id=proceso.id),
        models.EventoAgenda(titulo="De otro", tipo="AUDIENCIA", fecha_inicio=en_dos_dias, proceso_id=ajeno.id),
        models.EventoAgenda(titulo="Del archivado", tipo="AUDIENCIA", fecha_inicio=en_dos_dias, proceso_id=archivado.id),
        models.Tarea(usuario_id=abogada.id, proceso_id=proceso.id, titulo="Radicar alegatos", fecha_limite=utc_ahora() + timedelta(days=1)),
        models.Tarea(usuario_id=abogada.id, proceso_id=proceso.id, titulo="Hecha", estado=models.EstadoTarea.COMPLETADA,
                     fecha_limite=utc_ahora() + timedelta(days=1)),
        models.Tarea(usuario_id=abogada.id, titulo="Lejana", fecha_limite=utc_ahora() + timedelta(days=90)),
    ])
    sesion_bd.commit()
    return proceso


def test_agenda_junta_eventos_y_vencimientos(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN", nombre="Alejandra Muñoz")
    proceso = _datos(sesion_bd, abogada, crear_proceso, crear_usuario)
    iniciar(abogada)
    hoy = a_colombia(utc_ahora()).date()

    agenda = cliente_http.get("/api/v2/agenda", params={"desde": hoy.isoformat(), "hasta": (hoy + timedelta(days=6)).isoformat()}).json()
    assert [(i["tipo"], i["etiqueta"], i["titulo"]) for i in agenda["items"]] == [
        ("tarea", "Vence tarea", "Radicar alegatos"),
        ("evento", "Audiencia", "Audiencia inicial"),
        ("evento", "Reunión", "Reunión cancelada"),
    ]
    audiencia = agenda["items"][1]
    assert audiencia["proceso"] == {"id": proceso.id, "nombre": "Restitución Cardona"}
    assert audiencia["responsable"] == "Alejandra Muñoz"
    assert audiencia["inicio"].endswith("-05:00")
    assert audiencia["enlace"] == f"/gestion-procesos/abogado/procesos/{proceso.id}/agenda"
    assert agenda["items"][0]["todo_el_dia"] is True
    assert agenda["items"][2]["estado"] == "CANCELADO"

    largo = cliente_http.get("/api/v2/agenda", params={"desde": hoy.isoformat(), "hasta": (hoy + timedelta(days=90)).isoformat()})
    assert largo.status_code == 422
    invertido = cliente_http.get("/api/v2/agenda", params={"desde": hoy.isoformat(), "hasta": (hoy - timedelta(days=1)).isoformat()})
    assert invertido.status_code == 422


def test_suscripcion_de_calendario(iniciar, crear_usuario, crear_proceso, cliente_http, sesion_bd):
    abogada = crear_usuario("ABOGADO_ADMIN")
    _datos(sesion_bd, abogada, crear_proceso, crear_usuario)
    iniciar(abogada)
    assert cliente_http.get("/api/v2/agenda/suscripcion").json() == {"activa": False, "creada_en": None, "ultimo_uso": None}

    enlace = cliente_http.post("/api/v2/agenda/suscripcion", headers=H)
    assert enlace.status_code == 201
    ruta = enlace.json()["ruta"]
    assert ruta.startswith("/api/v2/agenda/feed.ics?token=")
    token = ruta.split("token=")[1]
    guardada = sesion_bd.query(models.SuscripcionCalendario).one()
    assert token not in guardada.token_hash, "solo se guarda el hash"

    # El calendario externo no tiene la cookie de la sesión.
    cliente_http.cookies.clear()
    feed = cliente_http.get(ruta)
    assert feed.status_code == 200
    assert feed.headers["content-type"].startswith("text/calendar")
    texto = feed.text
    assert texto.startswith("BEGIN:VCALENDAR\r\n") and texto.endswith("END:VCALENDAR\r\n")
    assert "SUMMARY:Audiencia: Audiencia inicial" in texto
    assert "SUMMARY:Vence: Radicar alegatos" in texto
    assert "SUMMARY:Vence: Lejana" in texto, "el feed mira un año hacia adelante"
    assert "cancelada" not in texto and "De otro" not in texto and "Hecha" not in texto
    sesion_bd.expire_all()
    assert sesion_bd.query(models.SuscripcionCalendario).one().ultimo_uso is not None

    iniciar(abogada)
    estado = cliente_http.get("/api/v2/agenda/suscripcion").json()
    assert estado["activa"] is True and estado["ultimo_uso"] is not None
    nueva = cliente_http.post("/api/v2/agenda/suscripcion", headers=H).json()["ruta"]
    assert cliente_http.get(ruta).status_code == 401, "renovar invalida el enlace anterior"
    assert cliente_http.get(nueva).status_code == 200
    assert cliente_http.delete("/api/v2/agenda/suscripcion", headers=H).status_code == 204
    assert cliente_http.get(nueva).status_code == 401


def test_el_cliente_no_tiene_agenda_del_equipo(iniciar, crear_usuario, cliente_http):
    iniciar(crear_usuario("CLIENTE"))
    assert cliente_http.get("/api/v2/agenda", params={"desde": "2026-10-01", "hasta": "2026-10-07"}).status_code == 403
    assert cliente_http.post("/api/v2/agenda/suscripcion", headers=H).status_code == 403


def test_ics_escapa_y_pliega_las_lineas():
    from datetime import date, datetime

    texto = calendario("Agenda", [
        EventoIcs(uid="evento-1@x", titulo="Audiencia; inicial, Cardona", inicio=datetime(2026, 10, 30, 14, 0),
                  descripcion="Línea 1\nLínea 2 " + "muy larga " * 12),
        EventoIcs(uid="tarea-2@x", titulo="Vence: Radicar", inicio=date(2026, 11, 2)),
    ], datetime(2026, 10, 28, 12, 0))
    assert "SUMMARY:Audiencia\\; inicial\\, Cardona" in texto
    assert "DTSTART:20261030T140000Z\r\nDTEND:20261030T150000Z" in texto
    assert "DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103" in texto
    assert "Línea 1\\nLínea 2" in texto
    assert all(len(linea.encode()) <= 75 for linea in texto.split("\r\n"))
    assert "\r\n " in texto, "las líneas largas siguen con un espacio"
