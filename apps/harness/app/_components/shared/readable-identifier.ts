export function readableIdentifier(value: string): string {
  const words = value.replaceAll("-", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
