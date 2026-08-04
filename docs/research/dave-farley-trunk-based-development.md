# Dave Farley sobre Trunk-Based Development

> Estado: investigación de fuentes primarias realizada el 2026-08-04. Las afirmaciones de
> Dave Farley se distinguen de las conclusiones de DORA y de la aplicación propuesta para
> Resona.

## Conclusión ejecutiva

Para Dave Farley, *Trunk-Based Development* (TBD) no es principalmente una configuración de
Git: es la disciplina de mantener una única versión compartida e interesante del sistema,
integrar cambios diminutos varias veces por día y evaluar cuanto antes el código realmente
integrado. Su preferencia estricta es trabajar sobre `main` y publicar de inmediato; acepta
que una rama de menos de un día debilita su objeción, pero pregunta qué valor aporta esa rama
([Farley, *Continuous Integration and Feature Branching*][farley-branching],
[Farley, guía de CI][farley-ci-guide]).

La práctica no consiste en bajar la calidad para mergear más rápido. Cada cambio debe ser
atómico, mantener el sistema funcionando y obtener feedback automatizado en minutos. Si
rompe el build, quien lo publicó debe arreglarlo enseguida o revertirlo. Las funcionalidades
grandes crecen mediante una secuencia de pasos seguros; no esperan completas y aisladas en
una rama ([Farley, *Continuous Integration and Feature Branching*][farley-branching],
[Farley, guía de CI][farley-ci-guide]).

Para Resona, la adopción sensata es comenzar con una versión pragmática de TBD: `main` como
única línea de desarrollo, PRs pequeños y de vida menor a un día cuando haga falta una
revisión, checks rápidos y obligatorios, y ningún branch permanente por workspace o
ambiente. El objetivo no es «mergear directo» antes de tener red de seguridad, sino diseñar
desde el inicio una red de seguridad que permita integrar continuamente. Esta recomendación
es una **síntesis para Resona**, no una afirmación textual de Farley.

## Alcance y criterio de fuentes

La posición de Farley se reconstruyó desde material escrito por él: sus artículos sobre CI,
ramas y feature flags, su guía práctica de CI, sus definiciones de entrega y despliegue, y su
evaluación de adopción de CD de 2025. Para separar convicción profesional de evidencia
empírica, se contrastó con fuentes originales de DORA de 2017, 2021, 2022 y 2023. No se
usaron resúmenes de terceros.

Las palabras **Farley sostiene** introducen una posición directa suya; **DORA encontró**
introduce resultados observacionales publicados por DORA; **síntesis para Resona** introduce
una inferencia de este informe.

## 1. Definición y propósito

Farley sostiene que CI necesita una sola imagen compartida del estado actual: cada cambio se
evalúa contra esa imagen y la línea desde la que se libera debe ser esa misma verdad. Una
«rama de integración» que recibe todo continuamente ya es, en la práctica, el trunk; otra
rama `main` posterior sólo agrega una selección no probada o exige repetir todas las pruebas
([*Don't Feature Branch*][farley-dont-feature-branch]).

En su guía práctica, lo expresa operativamente así: CI implica poco o nada de branching;
los cambios pequeños van a trunk y se evalúan continuamente. Si hay ramas, deben ser
diminutas y durar como máximo un día. «Continuo» significa integrar como mínimo a diario y,
preferentemente, obtener varias oportunidades de feedback cada día
([guía de CI de Farley][farley-ci-guide]).

La razón no es evitar conflictos de texto. Farley considera que una rama aísla ideas y
posterga el único feedback autoritativo: si el cambio funciona con el trabajo de todos los
demás en el artefacto que podría llegar a producción. Un merge automático tampoco detecta
incompatibilidades funcionales entre dos implementaciones válidas por separado
([*Don't Feature Branch*][farley-dont-feature-branch],
[*Continuous Integration and Feature Branching*][farley-branching]).

## 2. Expectativas de branch, merge y revisión

La postura estricta de Farley es:

- trabajar sobre trunk, hacer commits locales y publicarlos inmediatamente en el repositorio
  central donde corre CI;
- avanzar con muchos cambios atómicos por día; cuando está trabajando bien, dice seguir el
  ciclo `red-green-refactor-commit` aproximadamente cada 15 minutos;
- no publicar deliberadamente algo roto y mantener el software funcionando después de cada
  cambio;
- preferir pair programming para revisar el código mientras se desarrolla, en lugar de
  convertir una revisión asíncrona tardía en un lote grande.

Esas expectativas son declaraciones directas de Farley
([*Continuous Integration and Feature Branching*][farley-branching],
[guía de CI][farley-ci-guide]). No implican que «todo commit debe ser una feature completa»:
él distingue explícitamente entre un incremento incompleto y uno que rompe el sistema; el
primero puede integrarse e incluso desplegarse si sigue siendo seguro
([artículo de branching][farley-branching]).

DORA usa una definición empírica algo más tolerante: tres o menos ramas activas, vida menor
a un día, merge a trunk al menos diario y ausencia de code freezes o fases de integración.
La guía de DORA permite ramas de release como snapshots cuando hacen falta, pero indica que
los fixes deben volver a trunk cuanto antes y que despliegues varias veces al día pueden
eliminar incluso esas ramas ([capacidad TBD de DORA][dora-tbd]).

Por tanto, una PR corta no convierte automáticamente el proceso en feature branching. Lo
decisivo es si contiene un lote pequeño, recibe feedback rápido y se integra el mismo día.
Una PR que espera días por aprobaciones o que acumula una feature completa sí destruye el
loop que Farley busca; DORA identifica explícitamente las revisiones pesadas y asíncronas
como obstáculos para TBD ([capacidad TBD de DORA][dora-tbd]). Esta conclusión es una
**síntesis** entre la posición más estricta de Farley y la definición operacional de DORA.

## 3. Prerrequisitos de CI y pruebas

TBD sin feedback rápido no cumple el objetivo. La guía de Farley prescribe ejecutar los
commit tests localmente, aspirar a feedback en menos de cinco minutos, observar también las
evaluaciones más lentas y arreglar una falla en unos diez minutos o revertir. Mantener el
camino a producción abierto es responsabilidad colectiva, pero el autor del cambio es quien
mejor puede diagnosticarlo inmediatamente ([guía de CI de Farley][farley-ci-guide]).

DORA formula el contrato de CI de modo compatible: cada commit dispara build y pruebas
rápidas, las unitarias son obligatorias, el trunk roto tiene prioridad sobre cualquier otro
trabajo y un fallo que no pueda corregirse en minutos se revierte. El objetivo de feedback
para la suite rápida es unos pocos minutos, con diez minutos como límite superior; las
pruebas más largas pueden ir en etapas posteriores del deployment pipeline
([capacidad CI de DORA][dora-ci]).

Las pruebas deben ser confiables, no sólo numerosas. En la evaluación de Farley de 2025,
TBD, automatización de pruebas y pipeline completo aparecen como capacidades mutuamente
dependientes. Su recomendación de adopción comienza por pruebas automatizadas efectivas
—unitarias, integración, contratos y aceptación—, continúa con ramas cada vez más cortas y
termina con la automatización completa del pipeline
([evaluación de CD 2025 de Farley][farley-cd-2025]).

## 4. Lotes pequeños y evolución de funcionalidades

Farley responde a «¿cómo se construye algo complejo en 15 minutos?» con una regla de diseño:
no se construye todo; se descompone en una serie de cambios simples. Los pasos pequeños son
más fáciles de probar, entender, corregir y revertir, y obligan a hacer crecer la feature en
vez de construirla aparte y unirla al final
([artículo de branching][farley-branching], [guía de CI][farley-ci-guide]).

La unidad útil es un cambio coherente que deja el sistema válido, no una cantidad arbitraria
de líneas ni necesariamente una historia completa. DORA también distingue optimizar el
tiempo de «terminar una feature en una rama» de optimizar el flujo completo de revisar,
integrar, probar y desplegar. Los lotes pequeños reducen el tiempo hasta el feedback y
facilitan detectar, triar y corregir un problema
([capacidad CI de DORA][dora-ci], [lotes pequeños de DORA][dora-small-batches]).

## 5. Dark release, branch by abstraction y feature flags

Farley no propone feature flags como respuesta por defecto. Su jerarquía directa es:

1. liberar el cambio directamente si es posible;
2. usar *dark release* o *branch by abstraction* cuando haya que construirlo gradualmente;
3. recurrir a feature flags sólo cuando las opciones anteriores no funcionen.

El dark release permite integrar y probar algo que los usuarios todavía no consumen;
branch by abstraction permite cambiar entre implementaciones e incluso ejecutar la vieja y
la nueva en paralelo. Ambos conservan una sola línea de código integrada
([*A Few Thoughts on Feature Flags*][farley-flags]).

Farley ve valor en los flags porque aíslan comportamiento sin ocultar el código a los demás,
pero advierte que multiplican combinaciones de prueba y pueden producir crecimiento
exponencial de complejidad. También prefiere que los cambios de configuración atraviesen el
mismo pipeline para ser probados antes de liberarse
([*A Few Thoughts on Feature Flags*][farley-flags]).

La consecuencia práctica no es poner cada commit detrás de un booleano. Es preferible una
interfaz todavía no expuesta, una implementación paralela detrás de una abstracción o un
camino opt-in claramente acotado. Para Resona, limitar cantidad, combinaciones y vida de los
flags es una **síntesis preventiva** basada en el riesgo de testing descrito por Farley, no
una receta textual suya.

## 6. Relación con Continuous Delivery y Continuous Deployment

Farley considera TBD una práctica central de CI y CD: CI verifica el estado actual integrado;
CD evalúa si ese mismo estado es liberable. Mantener trunk liberable evita fases posteriores
de estabilización y conserva abierto el camino a producción
([artículo de branching][farley-branching], [evaluación de CD 2025][farley-cd-2025]).

Esto no obliga a poner todo cambio inmediatamente frente a usuarios. Farley separa:

- **deploy**: instalar y poner software en marcha en un ambiente;
- **release**: volver una capacidad disponible para el usuario;
- **continuous deployment**: automatizar la decisión de llevar a producción todo cambio cuyo
  pipeline pasa;
- **continuous delivery**: mantener un flujo continuo de valor y la capacidad de liberar
  cuando tenga sentido.

Estas son sus definiciones directas
([*Are we Deploying, Releasing or Delivering?*][farley-delivery-definitions]). La edición
oficial del libro que Farley coescribió resume CD como entrega rápida e incremental mediante
automatización de build, integración, pruebas y despliegue
([Pearson, *Continuous Delivery*][continuous-delivery-book]).

Para una librería o CLI como Resona, la meta inicial puede ser Continuous Delivery sin
Continuous Deployment: todo commit de `main` produce artefactos verificables y potencialmente
publicables, mientras publicar en npm o anunciar una API sigue siendo una decisión explícita.
Esto es una **aplicación a Resona** de la distinción anterior.

## 7. Qué evidencia respalda la práctica

La evidencia empírica de DORA consultada para este informe es observacional, no una prueba
de causalidad aislada:

- En 2017, DORA encontró diferencias estadísticamente significativas: los equipos de alto
  desempeño tenían ramas e integración que duraban horas; en los de bajo desempeño duraban
  días. El reporte recomendó integrar diariamente, usar menos de tres ramas y evitar ramas de
  más de un día ([State of DevOps 2017, pp. 39-40][dora-2017]).
- En 2021, los *elite performers* que además cumplían sus objetivos de confiabilidad eran 2,3
  veces más propensos a usar TBD; el reporte recomendó implementarlo junto con CI, no como una
  técnica aislada ([Accelerate State of DevOps 2021, p. 26][dora-2021]).
- En 2022, DORA encontró una interacción importante con experiencia: participantes con 16 o
  más años reportaron mejor desempeño, menos trabajo no planificado, menos errores y menor
  change failure rate con TBD; los menos experimentados reportaron la dirección opuesta. El
  reporte lo vinculó con prácticas complementarias como no abandonar nunca un trunk roto,
  gates y auto-revert ([Accelerate State of DevOps 2022, p. 30][dora-2022]).
- En 2023, el modelo de DORA estimó sólo un incremento menor de desempeño de entrega asociado
  con TBD y encontró que ese efecto estaba completamente mediado por Continuous Delivery. El
  hallazgo respalda la hipótesis de que TBD aporta mediante la capacidad de CD, no como una
  palanca independiente ([Accelerate State of DevOps 2023][dora-2023]).

Estos resultados apoyan «TBD dentro de un sistema de CI disciplinado», no «mergear más sin
controles». Tampoco demuestran que TBD por sí solo cause todos los resultados: DORA mide
conjuntos de capacidades y asociaciones entre prácticas y desempeño. Esta cautela es una
**lectura metodológica** de los reportes, coherente con que 2022 encontró resultados distintos
según experiencia y capacidades complementarias.

La encuesta de Farley de 2025 ofrece evidencia práctica más reciente, pero él mismo declara
que la muestra de casi cien organizaciones e individuos estaba familiarizada con sus catorce
principios y era presumiblemente autoseleccionada. Sirve para formular una ruta de adopción,
no para generalizar porcentajes a toda la industria
([evaluación de CD 2025][farley-cd-2025]).

## 8. Caveats y adopción gradual

Una adopción responsable conserva estas condiciones:

- **Primero, red de seguridad.** Construir pruebas confiables y un build repetible antes de
  eliminar el aislamiento que hoy compensa su ausencia
  ([evaluación de CD 2025][farley-cd-2025]).
- **Luego, acortar ramas.** Farley propone como transición ramas menores a dos días antes de
  llegar a TBD; DORA fija menos de un día como estado operativo de alto desempeño
  ([evaluación de CD 2025][farley-cd-2025], [capacidad TBD de DORA][dora-tbd]).
- **Revisar sin crear cola.** Pairing o revisión sincrónica encaja mejor con la postura de
  Farley; si se usan PRs, la revisión debe tener prioridad y no durar horas o días
  ([artículo de branching][farley-branching], [capacidad TBD de DORA][dora-tbd]).
- **Trunk roto detiene el trabajo.** Arreglar o revertir inmediatamente; no acumular fallos ni
  abrir una «fase de estabilización» posterior
  ([guía de CI][farley-ci-guide], [capacidad CI de DORA][dora-ci]).
- **Mentoría y gates importan.** La evidencia de 2022 desaconseja presentar TBD como una
  simplificación apta sin entrenamiento, automatización o responsabilidad compartida
  ([DORA 2022][dora-2022]).
- **Flags con moderación.** El beneficio de integrar comportamiento oculto debe superar el
  costo de probar todas sus combinaciones ([Farley sobre flags][farley-flags]).

## 9. Aplicación propuesta a Resona

Esta sección es **síntesis para Resona**. El repositorio declara que todavía no contiene una
implementación y que será un framework TypeScript code-first con Studio, renderer, CLI y API
([README de Resona](../../README.md)). Además, el mapa de contexto anticipa workspaces pero
todavía conserva un único glosario compartido
([mapa de contexto](../../CONTEXT-MAP.md)). Es el momento barato para fijar el flujo antes de
que aparezcan ramas permanentes y pipelines incompatibles.

### Política de ramas

- `main` es la única línea de desarrollo y siempre debe quedar verde.
- No crear `develop`, ramas por ambiente ni ramas permanentes por paquete/workspace.
- Permitir ramas/PRs sólo como buffers breves de revisión: un cambio coherente, merge el mismo
  día y objetivo de horas, no de sprint.
- Si en el futuro hay ramas de mantenimiento para releases publicadas, los fixes nacen o
  vuelven primero a `main`; sólo después se seleccionan hacia una release.

Esto traduce la definición operacional de DORA y la preferencia más estricta de Farley sin
forzar commits directos antes de que exista un pipeline confiable
([DORA sobre TBD][dora-tbd], [Farley sobre branching][farley-branching]).

### Gate mínimo cuando se creen los workspaces

Cada push o PR debería ejecutar, con un único lockfile y comandos reproducibles:

1. formato/lint y validación de manifests;
2. typecheck de todos los límites públicos afectados;
3. unit tests rápidos y deterministas;
4. build de los paquetes y verificación de sus exports;
5. integration tests en los seams compartidos entre autoría, IR, renderer, CLI y Studio.

El loop bloqueante debería apuntar a menos de cinco minutos; suites de render, navegador o
compatibilidad más costosas pueden continuar en etapas posteriores, pero `main` no puede
considerarse publicable hasta que pasen las evaluaciones necesarias. La meta deriva del
feedback de cinco minutos de Farley y del pipeline escalonado de DORA
([guía de CI][farley-ci-guide], [capacidad CI de DORA][dora-ci]).

Resona ya decidió que preview y render offline deben compartir semántica determinista y que
las skills de agentes requieren un quality gate determinista
([ADR 0004](../adr/0004-offline-determinism-and-preview-parity.md),
[ADR 0056](../adr/0056-deterministic-quality-gate-for-agent-skills.md)). Esas decisiones
favorecen TBD: los tests pueden verificar contratos estables en vez de depender de una fase
manual de integración al final.

### Cómo cortar cambios reales

Una feature transversal —por ejemplo, agregar un nuevo nodo de efecto— puede crecer así:

1. introducir tipos o un seam interno sin exponer la capacidad;
2. agregar el IR y tests de serialización;
3. implementar el renderer detrás de una abstracción;
4. conectar preview y CLI con comportamiento todavía opt-in;
5. exponer la API pública y, finalmente, retirar el camino transitorio.

Cada paso debe compilar, probarse y preservar los contratos existentes. Para una API pública
incompleta, preferir no exportarla; para sustituir una implementación, preferir branch by
abstraction; reservar flags para un comportamiento que realmente necesite activación en
runtime. Esta secuencia aplica la jerarquía de Farley sin convertir el core determinista en
una matriz de toggles ([Farley sobre flags][farley-flags]).

### Señales de que el proceso se está desviando

Medir mensualmente: edad máxima y mediana de PRs, frecuencia de merge por persona, tiempo
hasta feedback del gate, tiempo con `main` rojo, cantidad de reverts y existencia de code
freezes. DORA propone explícitamente medir ramas activas, duración, frecuencia de merge,
tiempo de aprobación y períodos de freeze; los objetivos son tres o menos ramas activas,
merge diario como mínimo y ningún freeze de integración
([medición de TBD de DORA][dora-tbd]).

La decisión recomendada es adoptar ahora esta política pragmática y endurecerla a medida que
el gate gane confianza: primero PRs de horas, luego pairing o commits directos donde el riesgo
y las reglas de protección lo permitan. TBD debe ser el resultado visible de buen diseño,
pruebas rápidas y responsabilidad sobre trunk, no un atajo administrativo.

## Fuentes primarias consultadas

- Dave Farley, [*Don't Feature Branch*][farley-dont-feature-branch] (2011).
- Dave Farley, [*Continuous Integration and Feature Branching*][farley-branching] (2018).
- Dave Farley, [*A Few Thoughts on Feature Flags*][farley-flags] (2018).
- Dave Farley, [*Are we Deploying, Releasing or Delivering?*][farley-delivery-definitions]
  (2020).
- Dave Farley, [*10 Tips for Continuous Integration*][farley-ci-guide].
- Dave Farley, [*The State of Continuous Delivery in 2025*][farley-cd-2025].
- Jez Humble y David Farley, [*Continuous Delivery*][continuous-delivery-book] (sitio oficial
  de Pearson).
- DORA, [*Trunk-based development*][dora-tbd], [*Continuous integration*][dora-ci] y
  [*Working in small batches*][dora-small-batches].
- DORA, [*State of DevOps 2017*][dora-2017],
  [*Accelerate State of DevOps 2021*][dora-2021] y
  [*Accelerate State of DevOps 2022*][dora-2022], además de
  [*Accelerate State of DevOps 2023*][dora-2023].

[continuous-delivery-book]: https://www.pearson.com/en-us/subject-catalog/p/Humble-Continuous-Delivery-Reliable-Software-Releases-through-Build-Test-and-Deployment-Automation/P200000009113
[dora-2017]: https://dora.dev/research/2017/2017-state-of-devops-report.pdf
[dora-2021]: https://dora.dev/research/2021/dora-report/2021-dora-accelerate-state-of-devops-report.pdf
[dora-2022]: https://dora.dev/research/2022/dora-report/2022-dora-accelerate-state-of-devops-report.pdf
[dora-2023]: https://dora.dev/research/2023/dora-report/2023-dora-accelerate-state-of-devops-report.pdf
[dora-ci]: https://dora.dev/capabilities/continuous-integration/
[dora-small-batches]: https://dora.dev/capabilities/working-in-small-batches/
[dora-tbd]: https://dora.dev/capabilities/trunk-based-development/
[farley-branching]: https://www.davefarley.net/?p=247
[farley-cd-2025]: https://continuous-delivery.co.uk/cd-assessment/index
[farley-ci-guide]: https://continuous-delivery.co.uk/downloads/How%20To%20-%20Continuous%20Integration%202.pdf
[farley-delivery-definitions]: https://www.davefarley.net/?p=333
[farley-dont-feature-branch]: https://www.davefarley.net/?p=160
[farley-flags]: https://www.davefarley.net/?p=255
