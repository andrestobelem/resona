---
status: accepted
date: 2026-08-04
---

# La raíz del proyecto se resuelve una vez

El CLI puede descubrir la raíz del proyecto, mientras que la API exige una ruta absoluta.
Una vez creado el proyecto, todas las rutas relativas se resuelven contra esa raíz congelada
y no contra el directorio de trabajo actual.

## Opciones consideradas

- Resolver cada path contra el `cwd` en el momento de usarlo.
- Aplicar búsqueda implícita tanto en CLI como en API.
- Limitar el descubrimiento al CLI y hacer explícita la raíz programática.

Se eligió la tercera opción porque conserva una experiencia cómoda en terminal y elimina
dependencias ambientales ocultas en integraciones programáticas y operaciones largas.

## Consecuencias

- `--config` fija como raíz el directorio de ese archivo.
- Sin ese flag, el CLI busca hacia arriba el config más cercano.
- Si no existe config, el CLI usa su `cwd` inicial como raíz.
- `createProject({root})` exige una ruta absoluta.
- `entry`, `staticDir` y otras rutas relativas se resuelven contra la raíz congelada.
- Cambiar el `cwd` después de crear el proyecto no cambia sus recursos.
