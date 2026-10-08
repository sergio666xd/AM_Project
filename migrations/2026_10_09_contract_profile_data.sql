ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS genero VARCHAR(16);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS domicilio VARCHAR(120);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion VARCHAR(300);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tarjeta_profesional VARCHAR(40);

ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS genero_solicitado VARCHAR(16);
ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS numero_documento_solicitado VARCHAR(40);
ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS domicilio_solicitado VARCHAR(120);
ALTER TABLE solicitudes_edicion_perfil_cliente ADD COLUMN IF NOT EXISTS direccion_solicitada VARCHAR(300);
