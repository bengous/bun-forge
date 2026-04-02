export type FrontendPreset = "none" | "tanstack";

export type InitOptions = {
  readonly destination: string;
  readonly projectName: string;
  readonly packageName: string;
  readonly binName: string;
  readonly frontend: FrontendPreset;
  readonly ai: boolean;
  readonly effect: boolean;
  readonly install: boolean;
  readonly gitInit: boolean;
  readonly yes: boolean;
};

export type TemplateContext = {
  readonly projectName: string;
  readonly packageName: string;
  readonly binName: string;
  readonly frontend: FrontendPreset;
  readonly ai: boolean;
  readonly effect: boolean;
  readonly hasWorkspaces: boolean;
};

export type Preset = {
  readonly name: string;
  readonly sourceDir: string;
  readonly enabled: (options: InitOptions) => boolean;
};
