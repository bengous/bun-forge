/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-lib-to-components",
      comment: "Lib utilities must not import components.",
      severity: "error",
      from: {
        path: "^src/lib/",
      },
      to: {
        path: "^src/components/",
      },
    },
  ],
  options: {
    moduleSystems: ["es6"],
    tsConfig: {
      fileName: "tsconfig.app.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
    },
  },
};
