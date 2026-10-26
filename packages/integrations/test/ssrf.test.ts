import { afterEach, describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress } from "../src/ssrf";

const lookupTo = (...addrs: string[]) => async () => addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

afterEach(() => {
  delete process.env.ALLOW_PRIVATE_WEBHOOKS;
});

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "ff02::1",
  ])("%s is private", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("%s is public", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertPublicUrl", () => {
  it("rejects hosts resolving to private ranges (any record)", async () => {
    await expect(assertPublicUrl("https://evil.test/x", { lookupFn: lookupTo("93.184.216.34", "10.0.0.1") })).rejects.toMatchObject({ kind: "rejected" });
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ kind: "rejected" });
    await expect(assertPublicUrl("https://[::1]/")).rejects.toMatchObject({ kind: "rejected" });
    await expect(assertPublicUrl("https://localhost/")).rejects.toMatchObject({ kind: "rejected" });
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toMatchObject({ kind: "rejected" });
  });
  it("accepts public hosts and requires https when asked", async () => {
    await expect(assertPublicUrl("https://ok.test/", { lookupFn: lookupTo("93.184.216.34") })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://ok.test/", { lookupFn: lookupTo("93.184.216.34"), requireHttps: true })).rejects.toThrow(/https/);
  });
  it("is bypassed with ALLOW_PRIVATE_WEBHOOKS=1", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOKS = "1";
    await expect(assertPublicUrl("http://127.0.0.1:4000/hook")).resolves.toBeInstanceOf(URL);
  });
});
