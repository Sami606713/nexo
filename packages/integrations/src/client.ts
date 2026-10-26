// OWNED BY: integrations agent. Browser-safe entry: NO node-only imports, NO SDKs, NO secrets.
// Only re-exports from the pure rules module (never import ./adapters/* or ./http here).
export { validateForNetwork, hasBlockingIssues, type PostDraft } from "./rules";
