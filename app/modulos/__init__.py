"""Módulos de negocio de la API v2.

Cada módulo separa sus capas:

- `esquemas.py`: modelos Pydantic de entrada y salida.
- `repositorio.py`: el único lugar con consultas a la base de datos.
- `politicas.py`: quién puede ver o cambiar qué.
- `servicio.py`: casos de uso; abre y confirma la transacción y registra la auditoría.
- `modelos.py`: modelos ORM del módulo.

Los routers de `app/api/v2` solo validan, llaman al servicio y devuelven el esquema.
"""
