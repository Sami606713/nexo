import { afterEach, describe, expect, it } from "vitest";
import {
  UnsafeUrlError,
  assertPublicUrl,
  extractBrandSignals,
  extractColors,
  extractVisibleText,
  fetchPage,
  isPrivateIp,
} from "../src/fetch-brand";

const publicDns = async () => ["93.184.216.34"];

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "ff02::1",
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPrivateIp(ip)).toBe(false),
  );
});

describe("assertPublicUrl", () => {
  afterEach(() => {
    delete process.env.ALLOW_PRIVATE_FETCH;
  });

  it("accepts public hosts and adds https when scheme missing", async () => {
    expect((await assertPublicUrl("example.com", publicDns)).toString()).toBe("https://example.com/");
  });
  it("rejects non-http schemes, credentials, localhost and private literals", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("ftp://example.com", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://user:pw@example.com", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://localhost:3000", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://127.0.0.1", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://[::1]/", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data", publicDns)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("rejects hostnames that resolve to private addresses (any record)", async () => {
    await expect(assertPublicUrl("https://evil.example", async () => ["93.184.216.34", "10.0.0.5"])).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicUrl("https://evil.example", async () => [])).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("ALLOW_PRIVATE_FETCH=1 disables the guard", async () => {
    process.env.ALLOW_PRIVATE_FETCH = "1";
    await expect(assertPublicUrl("http://127.0.0.1:8080", publicDns)).resolves.toBeInstanceOf(URL);
  });
});

describe("fetchPage", () => {
  it("re-validates redirect targets", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.startsWith("https://example.com")) {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
      }
      return new Response("<html>secret</html>", { headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    await expect(fetchPage("https://example.com", { resolve: publicDns, fetchImpl })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("caps the body size", async () => {
    const big = "a".repeat(5000);
    const fetchImpl = (async () => new Response(big, { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const page = await fetchPage("https://example.com", { resolve: publicDns, fetchImpl, maxBytes: 1000 });
    expect(page.html.length).toBe(1000);
  });

  it("rejects non-HTML and HTTP errors", async () => {
    const pdf = (async () => new Response("x", { headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    await expect(fetchPage("https://example.com", { resolve: publicDns, fetchImpl: pdf })).rejects.toThrow(/HTML/);
    const err = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchPage("https://example.com", { resolve: publicDns, fetchImpl: err })).rejects.toThrow(/500/);
  });
});

describe("extraction", () => {
  const html = `<!doctype html><html><head>
    <title> Acme &amp; Co — Coffee </title>
    <meta name="description" content="Specialty coffee roasted in Berlin.">
    <meta property="og:image" content="/og.png">
    <meta property="og:site_name" content="Acme Coffee">
    <meta name="theme-color" content="#C0392B">
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="https://cdn.acme.coffee/touch.png">
    <style>.a{color:#2E86DE}.b{color:#2e86de}.c{background:#fff}.d{color:#000000}.e{color:#27ae60}.f{color:#2E86DE}</style>
    <script>var secret = "do not include";</script>
  </head><body>
    <img class="site-logo" src="/img/logo.svg" alt="Acme">
    <h1>Roasted with care</h1><p>We roast   small batches.</p>
    <div style="border-color:#27AE60">Hi</div>
    <noscript>enable js</noscript>
  </body></html>`;

  it("extracts title, description, images and logos", () => {
    const s = extractBrandSignals(html, "https://acme.coffee/about");
    expect(s.title).toBe("Acme & Co — Coffee");
    expect(s.description).toBe("Specialty coffee roasted in Berlin.");
    expect(s.siteName).toBe("Acme Coffee");
    expect(s.ogImage).toBe("https://acme.coffee/og.png");
    expect(s.logoUrls[0]).toBe("https://acme.coffee/img/logo.svg");
    expect(s.logoUrls).toContain("https://cdn.acme.coffee/touch.png");
    expect(s.logoUrls).toContain("https://acme.coffee/favicon.ico");
  });

  it("colours: theme-color first, then by frequency, near white/black ignored", () => {
    const s = extractBrandSignals(html, "https://acme.coffee/");
    expect(s.colors).toEqual(["#c0392b", "#2e86de", "#27ae60"]);
    expect(extractColors("#fff #fefefe #000 #111 #010101")).toEqual([]);
    expect(extractColors("#123456 #abc #abc #ABCDEF #a1b2c3 #c3b2a1 #999999 #888888").length).toBe(5);
    expect(extractColors("#abc #abc #123456")[0]).toBe("#aabbcc");
  });

  it("visible text excludes scripts/styles/noscript and is capped", () => {
    const t = extractVisibleText(html);
    expect(t).toContain("Roasted with care");
    expect(t).toContain("We roast small batches.");
    expect(t).not.toContain("secret");
    expect(t).not.toContain("enable js");
    expect(t).not.toContain("color:");
    expect(extractVisibleText(`<body>${"word ".repeat(5000)}</body>`).length).toBeLessThanOrEqual(8000);
  });
});
