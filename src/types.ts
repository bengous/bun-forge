export type FrontendPreset = "none" | "tanstack";

declare const brand: unique symbol;

export type Brand<TValue, TBrand extends string> = TValue & {
  readonly [brand]: TBrand;
};

export type ProjectName = Brand<string, "ProjectName">;
export type PackageName = Brand<string, "PackageName">;
export type BinName = Brand<string, "BinName">;
export type SafeRelativePath = Brand<string, "SafeRelativePath">;
export type BackupRunId = Brand<string, "BackupRunId">;

export function brandValue<TValue, TBrand extends string>(value: TValue): Brand<TValue, TBrand> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Validators call this after proving the brand invariant.
  return value as Brand<TValue, TBrand>;
}

export type InitOptionsInput = {
  readonly destination?: string;
  readonly projectName?: string;
  readonly packageName?: string;
  readonly binName?: string;
  readonly frontend?: FrontendPreset;
  readonly ai?: boolean;
  readonly effect?: boolean;
  readonly install?: boolean;
  readonly gitInit?: boolean;
  readonly yes?: boolean;
};

export type AdoptOptionsInput = {
  readonly destination?: string;
  readonly projectName?: string;
  readonly packageName?: string;
  readonly binName?: string;
  readonly frontend?: FrontendPreset;
  readonly ai?: boolean;
  readonly effect?: boolean;
  readonly install?: boolean;
  readonly apply?: boolean;
  readonly rollback?: string;
  readonly yes?: boolean;
};

export type InitOptions = {
  readonly destination: string;
  readonly projectName: ProjectName;
  readonly packageName: PackageName;
  readonly binName: BinName;
  readonly frontend: FrontendPreset;
  readonly ai: boolean;
  readonly effect: boolean;
  readonly install: boolean;
  readonly gitInit: boolean;
  readonly yes: boolean;
};

export type AdoptOptions = {
  readonly destination: string;
  readonly projectName: ProjectName;
  readonly packageName: PackageName;
  readonly binName: BinName;
  readonly frontend: FrontendPreset;
  readonly ai: boolean;
  readonly effect: boolean;
  readonly install: boolean;
  readonly apply: boolean;
  readonly rollback: BackupRunId | undefined;
  readonly yes: boolean;
};

export type TemplateContext = {
  readonly projectName: ProjectName;
  readonly packageName: PackageName;
  readonly binName: BinName;
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
