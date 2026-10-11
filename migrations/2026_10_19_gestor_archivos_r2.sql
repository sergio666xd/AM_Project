-- Allows Admin to remove a registration-card object while preserving the
-- registration request and its review history.
ALTER TABLE solicitudes_registro
    ALTER COLUMN ruta_tarjeta_profesional DROP NOT NULL;
