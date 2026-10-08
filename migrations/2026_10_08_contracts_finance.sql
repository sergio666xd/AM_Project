-- PostgreSQL migration for contract and manual finance persistence.
-- Safe to execute after the existing tables (usuarios, procesos, eventos_agenda,
-- documentos_proceso) exist. All additions are idempotent.

CREATE TABLE IF NOT EXISTS contratos_servicios (
    id SERIAL PRIMARY KEY,
    proceso_id INTEGER NOT NULL REFERENCES procesos(id) ON DELETE RESTRICT,
    cliente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    abogado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    estado VARCHAR(24) NOT NULL DEFAULT 'BORRADOR',
    version_actual INTEGER NOT NULL DEFAULT 1,
    contenido_actual TEXT NOT NULL,
    parte_cliente_snapshot JSON NOT NULL DEFAULT '{}'::json,
    emitido_en TIMESTAMP,
    firmado_en TIMESTAMP,
    terminado_en TIMESTAMP,
    motivo_terminacion TEXT,
    anulado_en TIMESTAMP,
    motivo_anulacion TEXT,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_contratos_servicios_proceso_id ON contratos_servicios(proceso_id);
CREATE INDEX IF NOT EXISTS ix_contratos_servicios_cliente_id ON contratos_servicios(cliente_id);
CREATE INDEX IF NOT EXISTS ix_contratos_servicios_abogado_id ON contratos_servicios(abogado_id);
CREATE INDEX IF NOT EXISTS ix_contratos_servicios_estado ON contratos_servicios(estado);
CREATE INDEX IF NOT EXISTS ix_contratos_proceso_estado ON contratos_servicios(proceso_id, estado);

CREATE TABLE IF NOT EXISTS contratos_servicios_versiones (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES contratos_servicios(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    estado VARCHAR(24) NOT NULL,
    contenido TEXT NOT NULL,
    parte_cliente_snapshot JSON NOT NULL DEFAULT '{}'::json,
    hash_sha256 VARCHAR(64) NOT NULL,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_contrato_servicio_version UNIQUE (contrato_id, version)
);
CREATE INDEX IF NOT EXISTS ix_contratos_servicios_versiones_contrato_id ON contratos_servicios_versiones(contrato_id);

CREATE TABLE IF NOT EXISTS entregas_correo_contrato (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES contratos_servicios(id) ON DELETE RESTRICT,
    documento_id INTEGER REFERENCES documentos_proceso(id) ON DELETE SET NULL,
    version INTEGER NOT NULL,
    destinatario VARCHAR(320) NOT NULL,
    estado VARCHAR(16) NOT NULL,
    error TEXT,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_entregas_correo_contrato_contrato_id ON entregas_correo_contrato(contrato_id);

ALTER TABLE eventos_agenda ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos_servicios(id) ON DELETE SET NULL;
ALTER TABLE documentos_proceso ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos_servicios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_eventos_agenda_contrato_id ON eventos_agenda(contrato_id);
CREATE INDEX IF NOT EXISTS ix_documentos_proceso_contrato_id ON documentos_proceso(contrato_id);
ALTER TABLE contratos_servicios ADD COLUMN IF NOT EXISTS campos_actual JSON NOT NULL DEFAULT '{}'::json;
ALTER TABLE contratos_servicios_versiones ADD COLUMN IF NOT EXISTS campos JSON NOT NULL DEFAULT '{}'::json;

CREATE TABLE IF NOT EXISTS cuentas_cobro (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(32),
    abogado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    proceso_id INTEGER REFERENCES procesos(id) ON DELETE SET NULL,
    cliente_snapshot JSON NOT NULL DEFAULT '{}'::json,
    abogado_snapshot JSON NOT NULL DEFAULT '{}'::json,
    concepto VARCHAR(255) NOT NULL,
    moneda VARCHAR(3) NOT NULL DEFAULT 'COP',
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado VARCHAR(16) NOT NULL DEFAULT 'BORRADOR',
    fecha_emision TIMESTAMP,
    fecha_vencimiento TIMESTAMP,
    anulada_en TIMESTAMP,
    motivo_anulacion TEXT,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cuenta_cobro_numero UNIQUE(numero),
    CONSTRAINT ck_cuenta_cobro_total_no_negativo CHECK(total >= 0)
);
CREATE INDEX IF NOT EXISTS ix_cuentas_cobro_abogado_id ON cuentas_cobro(abogado_id);
CREATE INDEX IF NOT EXISTS ix_cuentas_cobro_cliente_id ON cuentas_cobro(cliente_id);
CREATE INDEX IF NOT EXISTS ix_cuentas_cobro_proceso_id ON cuentas_cobro(proceso_id);
CREATE INDEX IF NOT EXISTS ix_cuentas_cobro_estado ON cuentas_cobro(estado);
CREATE INDEX IF NOT EXISTS ix_cuentas_cobro_fecha_vencimiento ON cuentas_cobro(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS ix_cuenta_cobro_cliente_estado ON cuentas_cobro(cliente_id, estado);
CREATE INDEX IF NOT EXISTS ix_cuenta_cobro_abogado_estado ON cuentas_cobro(abogado_id, estado);

CREATE TABLE IF NOT EXISTS cuentas_cobro_lineas (
    id SERIAL PRIMARY KEY,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas_cobro(id) ON DELETE CASCADE,
    descripcion VARCHAR(500) NOT NULL,
    cantidad NUMERIC(14,2) NOT NULL DEFAULT 1,
    valor_unitario NUMERIC(14,2) NOT NULL,
    total NUMERIC(14,2) NOT NULL,
    CONSTRAINT ck_cuenta_linea_cantidad_positiva CHECK(cantidad > 0),
    CONSTRAINT ck_cuenta_linea_valor_no_negativo CHECK(valor_unitario >= 0),
    CONSTRAINT ck_cuenta_linea_total_no_negativo CHECK(total >= 0)
);
CREATE INDEX IF NOT EXISTS ix_cuentas_cobro_lineas_cuenta_id ON cuentas_cobro_lineas(cuenta_id);

CREATE TABLE IF NOT EXISTS pagos_financieros (
    id SERIAL PRIMARY KEY,
    numero_recibo VARCHAR(32),
    clave_idempotencia VARCHAR(100) NOT NULL,
    abogado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    proceso_id INTEGER REFERENCES procesos(id) ON DELETE SET NULL,
    abogado_snapshot JSON NOT NULL DEFAULT '{}'::json,
    cliente_snapshot JSON NOT NULL DEFAULT '{}'::json,
    importe NUMERIC(14,2) NOT NULL,
    moneda VARCHAR(3) NOT NULL DEFAULT 'COP',
    origen VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    metodo VARCHAR(24) NOT NULL,
    referencia VARCHAR(120),
    estado VARCHAR(16) NOT NULL DEFAULT 'REGISTRADO',
    fecha_pago TIMESTAMP NOT NULL,
    registrado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pago_numero_recibo UNIQUE(numero_recibo),
    CONSTRAINT uq_pago_clave_idempotencia UNIQUE(clave_idempotencia),
    CONSTRAINT ck_pago_importe_positivo CHECK(importe > 0)
);
CREATE INDEX IF NOT EXISTS ix_pagos_financieros_abogado_id ON pagos_financieros(abogado_id);
CREATE INDEX IF NOT EXISTS ix_pagos_financieros_cliente_id ON pagos_financieros(cliente_id);
CREATE INDEX IF NOT EXISTS ix_pagos_financieros_proceso_id ON pagos_financieros(proceso_id);
CREATE INDEX IF NOT EXISTS ix_pagos_financieros_estado ON pagos_financieros(estado);
CREATE INDEX IF NOT EXISTS ix_pago_cliente_fecha ON pagos_financieros(cliente_id, fecha_pago);

CREATE TABLE IF NOT EXISTS aplicaciones_pago (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos_financieros(id) ON DELETE RESTRICT,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas_cobro(id) ON DELETE RESTRICT,
    importe NUMERIC(14,2) NOT NULL,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_aplicacion_pago_importe_positivo CHECK(importe > 0)
);
CREATE INDEX IF NOT EXISTS ix_aplicaciones_pago_pago_id ON aplicaciones_pago(pago_id);
CREATE INDEX IF NOT EXISTS ix_aplicaciones_pago_cuenta_id ON aplicaciones_pago(cuenta_id);
CREATE INDEX IF NOT EXISTS ix_aplicacion_pago_cuenta_pago ON aplicaciones_pago(cuenta_id, pago_id);

CREATE TABLE IF NOT EXISTS ajustes_cuenta_cobro (
    id SERIAL PRIMARY KEY,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas_cobro(id) ON DELETE RESTRICT,
    tipo VARCHAR(12) NOT NULL,
    importe NUMERIC(14,2) NOT NULL,
    motivo TEXT NOT NULL,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_ajuste_cuenta_importe_positivo CHECK(importe > 0)
);
CREATE INDEX IF NOT EXISTS ix_ajustes_cuenta_cobro_cuenta_id ON ajustes_cuenta_cobro(cuenta_id);

CREATE TABLE IF NOT EXISTS reversiones_pago (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos_financieros(id) ON DELETE RESTRICT,
    motivo TEXT NOT NULL,
    revertido_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_reversion_pago UNIQUE(pago_id)
);

CREATE TABLE IF NOT EXISTS configuracion_correo_financiero (
    id INTEGER PRIMARY KEY DEFAULT 1,
    remitente_nombre VARCHAR(180) NOT NULL DEFAULT 'Alejandra Muñoz | Abogada y Asociados',
    remitente_email VARCHAR(320),
    reply_to VARCHAR(320),
    actualizado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entregas_correo_financiero (
    id SERIAL PRIMARY KEY,
    cuenta_id INTEGER REFERENCES cuentas_cobro(id) ON DELETE SET NULL,
    pago_id INTEGER REFERENCES pagos_financieros(id) ON DELETE SET NULL,
    destinatario VARCHAR(320) NOT NULL,
    estado VARCHAR(16) NOT NULL,
    version_datos INTEGER,
    error TEXT,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_entrega_financiera_recurso CHECK(cuenta_id IS NOT NULL OR pago_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_entregas_correo_financiero_cuenta_id ON entregas_correo_financiero(cuenta_id);
CREATE INDEX IF NOT EXISTS ix_entregas_correo_financiero_pago_id ON entregas_correo_financiero(pago_id);
CREATE INDEX IF NOT EXISTS ix_entrega_financiera_estado_fecha ON entregas_correo_financiero(estado, created_at);
