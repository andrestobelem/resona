# Zod input adapter context

`@resona/zod` adapts Zod 4 object schemas to the Resona-owned `InputSchema` seam. It is the
only workspace allowed to inspect Zod internals; Engine and future Studio code consume only
`InputSchema` and its serializable `InputSchemaIR`.

The adapter validates synchronously and never returns parsed data. It rejects coercion,
transforms, preprocess, catch, defaults, stripping objects, overwrites and detectable async
refinements when `fromZod()` is called. A runtime guard converts a latent refinement promise
into a validation failure before authoring or DSP.

The descriptor is a Resona-versioned envelope around JSON Schema Draft 2020-12. JSON Schema
supports inspection and controls; the original `InputSchema` remains the authoritative
validator.
