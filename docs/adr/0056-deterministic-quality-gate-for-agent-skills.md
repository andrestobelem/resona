---
status: accepted
date: 2026-08-04
---

# Las Agent Skills tienen un gate de calidad determinista

Una Agent Skill oficial solo se publica cuando sus metadatos y workflows verificables pasan
pruebas deterministas contra el mismo release de Resona. Las evaluaciones ejecutadas por
modelos concretos aportan señales de calidad, pero inicialmente no bloquean releases.

## Opciones consideradas

- Revisar las skills manualmente y asumir que su versión garantiza vigencia.
- Bloquear releases mediante evaluaciones end-to-end ejecutadas por modelos de IA.
- Bloquear mediante verificaciones reproducibles y usar las evaluaciones con modelos como
  observabilidad complementaria.

Se eligió la tercera opción porque detecta referencias rotas y workflows obsoletos sin hacer
que la publicación dependa de resultados variables, proveedores externos o modelos
específicos.

## Consecuencias

- Cada skill valida frontmatter, versión, enlaces y referencias internas.
- Sus comandos y ejemplos se ejecutan o compilan en un proyecto fixture.
- Cada workflow publicado tiene una prueba de punta a punta contra la CLI y las APIs reales.
- Todas las verificaciones deterministas usan los artefactos del release correspondiente.
- Una falla determinista impide publicar las skills y el release que promete incluirlas.
- Evals con Codex, Claude u otros modelos producen métricas y casos de mejora, pero no son un
  gate bloqueante inicialmente.
