from app import models

H = {"X-AM-Solicitud": "1"}
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def _suscripcion(endpoint="https://push.example/abc", **extra):
    return {"endpoint": endpoint, "keys": {"p256dh": "clave", "auth": "secreto"}, "user_agent": IPHONE, **extra}


def test_dispositivos_con_notificaciones(iniciar, crear_usuario, cliente_http, sesion_bd, monkeypatch):
    abogada, colega = crear_usuario("ABOGADO_ADMIN"), crear_usuario("ABOGADO")
    iniciar(abogada)

    monkeypatch.delenv("WEB_PUSH_VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("WEB_PUSH_VAPID_PRIVATE_KEY", raising=False)
    assert cliente_http.get("/api/v2/push/clave-publica").status_code == 503
    assert cliente_http.post("/api/v2/push/suscripciones", json=_suscripcion(), headers=H).status_code == 503
    assert cliente_http.get("/api/v2/push/dispositivos").json() == {"items": [], "configurado": False}

    monkeypatch.setenv("WEB_PUSH_VAPID_PUBLIC_KEY", "publica")
    monkeypatch.setenv("WEB_PUSH_VAPID_PRIVATE_KEY", "privada")
    assert cliente_http.get("/api/v2/push/clave-publica").json() == {"clave": "publica"}
    sin_claves = {**_suscripcion(), "keys": {"p256dh": "x"}}
    assert cliente_http.post("/api/v2/push/suscripciones", json=sin_claves, headers=H).status_code == 422

    creado = cliente_http.post("/api/v2/push/suscripciones", json=_suscripcion(), headers=H)
    assert creado.status_code == 201 and creado.json()["nombre"] == "iPhone · Safari"
    cliente_http.post("/api/v2/push/suscripciones", json=_suscripcion("https://push.example/otro", nombre="Portátil"), headers=H)
    lista = cliente_http.get("/api/v2/push/dispositivos").json()
    assert lista["configurado"] is True
    assert sorted(d["nombre"] for d in lista["items"]) == ["Portátil", "iPhone · Safari"]

    # El mismo navegador en otra cuenta pasa a esa cuenta.
    iniciar(colega)
    cliente_http.post("/api/v2/push/suscripciones", json=_suscripcion(), headers=H)
    assert [d["nombre"] for d in cliente_http.get("/api/v2/push/dispositivos").json()["items"]] == ["iPhone · Safari"]
    ajeno = sesion_bd.query(models.ChatPushSubscription).filter_by(endpoint="https://push.example/otro").one()
    assert cliente_http.delete(f"/api/v2/push/dispositivos/{ajeno.id}", headers=H).status_code == 404

    iniciar(abogada)
    assert [d["nombre"] for d in cliente_http.get("/api/v2/push/dispositivos").json()["items"]] == ["Portátil"]
    assert cliente_http.delete(f"/api/v2/push/dispositivos/{ajeno.id}", headers=H).status_code == 204
    iniciar(colega)
    assert cliente_http.post("/api/v2/push/suscripciones/baja", json={"endpoint": "https://push.example/abc"}, headers=H).status_code == 204
    assert cliente_http.get("/api/v2/push/dispositivos").json()["items"] == []
    assert cliente_http.post("/api/v2/push/prueba", headers=H).status_code == 409


def test_presencia_del_panel(iniciar, crear_usuario, cliente_http, sesion_bd):
    sesion = {"sesion": "pestana-0123456789abcdef"}
    cliente = crear_usuario("CLIENTE")
    iniciar(cliente)
    assert cliente_http.post("/api/v2/push/presencia", json=sesion, headers=H).json() == {"activo": True, "expira_en_segundos": 90}
    cliente_http.post("/api/v2/push/presencia", json=sesion, headers=H)
    assert sesion_bd.query(models.ChatPresenciaPanel).filter_by(usuario_id=cliente.id).count() == 1
    assert cliente_http.post("/api/v2/push/presencia/cierre", json=sesion, headers=H).status_code == 204
    assert sesion_bd.query(models.ChatPresenciaPanel).filter_by(usuario_id=cliente.id).count() == 0
    assert cliente_http.post("/api/v2/push/presencia", json={"sesion": "corta"}, headers=H).status_code == 422

    iniciar(crear_usuario("ABOGADO"))
    assert cliente_http.post("/api/v2/push/presencia", json=sesion, headers=H).json()["activo"] is False
