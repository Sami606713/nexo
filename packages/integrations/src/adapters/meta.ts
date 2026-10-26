// TODO(meta): Facebook Pages & Instagram publishing are blocked on Meta app review.
// validate() is complete (used by the editor); connect/publish throw until the Graph API flow is built.
import { AdapterError, NETWORK_LIMITS, type NetworkAdapter } from "@postline/core";
import { validateForNetwork } from "../rules";

const pending = () => new AdapterError("rejected", "Meta app review pending");

function metaAdapter(network: "FACEBOOK" | "INSTAGRAM"): NetworkAdapter {
  return {
    network,
    limits: NETWORK_LIMITS[network],
    connectKind: "oauth2",
    getAuthorizeUrl() {
      throw pending();
    },
    async exchangeCode() {
      throw pending();
    },
    async refresh() {
      return null;
    },
    validate: (post) => validateForNetwork(network, post),
    async publish() {
      throw pending();
    },
    async delete() {
      throw pending();
    },
  };
}

export const facebookAdapter = metaAdapter("FACEBOOK");
export const instagramAdapter = metaAdapter("INSTAGRAM");
