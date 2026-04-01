export const projectName = "__PROJECT_NAME__";

export function createGreeting(name = projectName): string {
  return `Hello from ${name}`;
}

if (import.meta.main) {
  console.log(createGreeting());
}
