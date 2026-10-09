-- Store Colombian identification and professional card numbers without separators.
UPDATE usuarios
SET numero_documento = REPLACE(numero_documento, '.', '')
WHERE numero_documento IS NOT NULL AND POSITION('.' IN numero_documento) > 0;

UPDATE usuarios
SET tarjeta_profesional = REPLACE(tarjeta_profesional, '.', '')
WHERE tarjeta_profesional IS NOT NULL AND POSITION('.' IN tarjeta_profesional) > 0;
