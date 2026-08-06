declare module "markdown-it" {
  export type MarkdownItAttribute = readonly [name: string, value: string];

  export type MarkdownItHighlight = (source: string, language: string) => string;

  export type MarkdownItOptions = Readonly<{
    html?: boolean;
    highlight?: MarkdownItHighlight;
  }>;

  export type MarkdownItToken = {
    attrs: MarkdownItAttribute[] | null;
    children?: MarkdownItToken[] | null;
    content: string;
    info: string;
    level: number;
    map: [number, number] | null;
    markup: string;
    nesting: number;
    tag: string;
    type: string;
  };

  export interface MarkdownItRenderer {
    rules: Record<
      string,
      (
        tokens: MarkdownItToken[],
        index: number,
        options: MarkdownItOptions,
        environment: Record<string, unknown>,
        self: MarkdownItRenderer,
      ) => string
    >;
    renderToken(tokens: MarkdownItToken[], index: number, options: MarkdownItOptions): string;

    render(
      tokens: MarkdownItToken[],
      options: MarkdownItOptions,
      environment: Record<string, unknown>,
    ): string;
  }

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);

    readonly options: MarkdownItOptions;

    readonly renderer: MarkdownItRenderer;

    parse(source: string, environment: Record<string, unknown>): MarkdownItToken[];

    render(source: string, environment?: Record<string, unknown>): string;
  }
}
