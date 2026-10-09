
Actúa como un Diseñador UX/UI Senior y Arquitecto de Información Experto. Tu objetivo es realizar una auditoría completa del proyecto, evaluar las páginas existentes agrupadas por bloques funcionales, proponer nuevas páginas estratégicas y documentar todo en un archivo estructurado en Markdown (.md).

Para optimizar mis créditos y mantener el control, trabajaremos estrictamente por hitos secuenciales. Detente después de cada fase y espera mi confirmación para continuar.

---

### FASE 1: MAPEO DE BLOQUES Y DISEÑO DE RÚBRICA

1. Analiza el árbol de archivos de mi proyecto y agrupa las páginas existentes en "Bloques Funcionales" lógicos (por ejemplo: Bloque de Autenticación, Bloque de Dashboard/Usuario, Bloque de Configuración, etc.).
2. Diseña una rúbrica de evaluación exhaustiva en formato de tabla Markdown que apliques a cada bloque. La rúbrica debe evaluar de 1 a 5 los siguientes criterios:
   - Accesibilidad (WCAG 2.2): Contraste, tamaños de fuente, legibilidad, áreas de clic (mínimo 44x44px).
   - Responsividad: Adaptabilidad móvil, breakpoints, consistencia del layout.
   - Usabilidad (Heurísticas de Nielsen): Claridad de CTAs, estados de componentes (hover, focus, disabled), consistencia visual y prevención de errores.
   - Carga Cognitiva: Estética, jerarquía visual y simplicidad.

Presenta la propuesta de bloques y la estructura de la rúbrica. DETENTE AQUÍ y pregunta: "¿Estás de acuerdo con esta agrupación de bloques para iniciar la evaluación?"

---

### FASE 2: EVALUACIÓN INTEGRAL Y PROPUESTA DE NUEVAS PÁGINAS

Una vez que apruebe la Fase 1, procede a evaluar todo el sistema sin escribir código de componentes aún:

1. Crea un archivo central llamado `auditoria_ux_ui.md` en la raíz.
2. Para cada Bloque Funcional, genera una tabla Markdown aplicando la rúbrica a las páginas que lo componen, detallando "Aspectos a Mejorar" y "Elementos a Añadir".
3. **Análisis de Brechas (Gap Analysis):** Antes de planificar mejoras, evalúa la arquitectura actual y propón formalmente qué páginas o pantallas NUEVAS se deberían agregar para optimizar la experiencia del usuario (ej. páginas de error 404 personalizadas, pantallas de carga, flujos intermedios de confirmación, etc.).

Muestra el resultado completo del archivo `auditoria_ux_ui.md`. DETENTE AQUÍ y pregunta: "¿Procedemos a la Fase 3 para implementar las mejoras y crear las nuevas páginas bloque por bloque?"

---

### FASE 3: IMPLEMENTACIÓN MODULAR POR BLOQUES (Esperar mi luz verde)

Cuando te indique qué bloque abordar:

1. Lee las directrices de mejora que tú mismo documentaste en `auditoria_ux_ui.md` para ese bloque específico.
2. Reescribe o construye desde cero el código (HTML/Tailwind/React, según corresponda) de las páginas de ese bloque, garantizando una calificación perfecta de 5/5 en la rúbrica.
3. Si el bloque incluye una de las "páginas sugeridas" en la Fase 2, créala desde cero con su código completo.
4. Al finalizar el bloque, detente y pide mi aprobación antes de pasar al siguiente bloque funcional.
