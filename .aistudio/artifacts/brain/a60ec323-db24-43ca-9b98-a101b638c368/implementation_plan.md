# Detección y Gestión de Correos Falsos en Base de Datos

Plan para implementar un sistema de auditoría, informe interactivo y depuración de correos falsos, temporales y cuentas de prueba registrados en la base de datos de Fantasy F1.

## User Review & Critical Decisions

> [!IMPORTANT]
> Se confirmaron las preferencias en la fase de clarificación previa:
> - **Criterios de detección**: Dominios desechables (Mailinator, TempMail, Yopmail, etc.), dominios de prueba/ejemplo (`example.com`, `test.com`, `enzo.com`, etc.) y patrones sintácticos sospechosos (caracteres aleatorios, prefijos de prueba, managers ficticios).
> - **Acción seleccionada**: Informe detallado con revisión visual y capacidad de eliminar selectiva o masivamente los registros de la base de datos, con copia de seguridad previa automática.

- **Cuentas protegidas**: El correo del usuario principal (`enzo.castillo.lomb@gmail.com`) y cuentas con dominios legítimos verificados quedan explícitamente excluidos de la lista negra y protegidos contra borrado involuntario.
- **Seguridad en base de datos**: Antes de cualquier eliminación, se creará un snapshot automático de respaldo (`fantasy_teams_db_backup_cleanup_<timestamp>.json` y `users_db_backup_<timestamp>.json`).

---

## 1. Overview & Core Concept

- **Qué hace**: Proporciona un módulo administrativo integrado y endpoints de auditoría en el backend para analizar exhaustivamente todas las cuentas en `fantasy_teams_db.json` y `users_db.json`. Identifica y clasifica cuentas sospechosas (falsas, temporales, duplicados o tests) según reglas heurísticas claras, muestra un informe estructurado y permite eliminar las cuentas no deseadas manteniendo la integridad de la competición y las clasificaciones.
- **Público objetivo**: Administrador / Gestor de la plataforma Fantasy F1.
- **Valor clave**: Mantiene la base de datos limpia de spam, cuentas fantasma y pruebas locales que distorsionan las tablas de posiciones y los registros de usuarios.

---

## 2. User Experience & Visual Design

### Flujo de Usuario
1. **Acceso al Panel de Auditoría**: Desde el menú de gestión/administración o modal dedicado de mantenimiento, el administrador abre la sección "Auditoría de Cuentas y Correos".
2. **Visualización del Informe**:
   - Resumen métrico: Total de cuentas analizadas, correos limpios/legítimos, y número de cuentas sospechosas detectadas desglosadas por categoría (dominio temporal, dominio dummy/test, patrón anómalo).
   - Tabla de resultados: Lista cada cuenta detectada con su Email, Nombre de Manager, Nombre de Escudería, Motivo de detección (p. ej. *Dominio de prueba example.com*, *Servicio desechable*, *Patrón sospechoso*), y fecha de registro.
3. **Selección y Eliminación**:
   - Casillas de selección individual y botón "Seleccionar todos los sospechosos".
   - Botón de acción con confirmación modal de seguridad: *"Eliminar X cuentas seleccionadas"*.
   - Feedback inmediato con notificación de éxito y actualización instantánea de la tabla sin recargar la página.

### Identidad Visual y Componentes (Design System)
- **Tema**: Acorde a la interfaz actual de Fantasy F1 (Slate oscuro / Dark mode industrial con acentos rojo/carmesí de F1).
- **Tipografía**: Jerarquía limpia con números tabulares (`font-mono tabular-nums`) para contadores y fechas.
- **Estados**:
  - Estado cargando: Skeleton rows fluidas.
  - Estado vacío: Ilustración/mensaje de "Base de datos limpia, sin correos sospechosos detectados".
  - Estado de advertencia: Banner informativo que previene eliminar cuentas sin confirmación.

---

## 3. Key Product Decisions & Trade-Offs

- **Reglas de Detección Heurísticas vs Llamada a API externa de validación**:
  - *Elección*: Motor heurístico local en backend (lista exhaustiva de +150 dominios desechables conocidos como 10minutemail, mailinator, guerrillamail, tempmail; dominios reservados RFC 2606 `example.com`, `test`, `localhost`; y patrones de prueba `asdf@`, `test@`, `fake@`, `enzo@enzo.com`).
  - *Motivo*: Instantáneo, sin coste de APIs de terceros, sin latencia de red y 100% fiable en el entorno local del servidor.
- **Sincronización Dual (`fantasy_teams_db.json` y `users_db.json`)**:
  - *Elección*: La depuración eliminará la cuenta de ambas bases de datos si existe en ambas, asegurando que no queden registros huérfanos.
- **Borrado con Respaldo Automático**:
  - *Elección*: Guardar una copia JSON antes de ejecutar cualquier mutación para permitir rollback inmediato si se eliminara alguna cuenta por error.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   Frontend (UI)                        │
│  - Modal / Vista de Auditoría de Correos               │
│  - Tabla reactiva con filtros y checkboxes             │
│  - Diálogo de confirmación con doble verificación      │
└───────────────────────────┬────────────────────────────┘
                            │
               GET /api/admin/audit-emails
               POST /api/admin/delete-accounts
                            │
┌───────────────────────────▼────────────────────────────┐
│                   Backend (Node.js)                    │
│  - emailAuditService.js / endpoints en server.js       │
│  - Heurísticas de dominios desechables y patrones      │
│  - Motor de copias de seguridad automáticas            │
└───────────────────────────┬────────────────────────────┘
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
   fantasy_teams_db.json             users_db.json
   (Equipos y Managers)         (Credenciales y Auth)
```

### Endpoints Planificados
1. `GET /api/admin/audit-emails`: Retorna el análisis completo de las bases de datos con métricas, lista de sospechosos con razones detalladas y lista de cuentas verificadas.
2. `POST /api/admin/delete-accounts`: Recibe un array de emails o IDs a eliminar, crea backup en disco y elimina las entradas correspondientes en `fantasy_teams_db.json` y `users_db.json`.
