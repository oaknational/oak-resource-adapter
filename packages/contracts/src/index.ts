/**
 * The current browser-safe contracts. When a breaking API version is needed,
 * preserve `v1.ts` unchanged and re-export the new version here for newly
 * released clients.
 */
export { resourceAdapterApiContractVersionV1 as resourceAdapterApiContractVersion } from "./v1.js";
export * from "./v1.js";
