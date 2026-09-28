const base = process.env.GORAIL_BASE || "https://gorail-web.vercel.app";

async function check(name, path, expect) {
  const res = await fetch(base + path, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  const ok = expect(res.status, body);
  console.log((ok ? "PASS " : "FAIL ") + name + " -> " + res.status);
  if (!ok) process.exitCode = 1;
}

await check("short train number", "/api/railradar?action=live&number=12", (status) => status === 400);
await check("bad pnr", "/api/railradar?action=pnr&pnr=000", (status) => status === 400);
await check("same stations", "/api/railradar?action=between&from=NDLS&to=NDLS", (status) => status === 400);
await check("live 12951", "/api/railradar?action=live&number=12951", (status) => status === 200 || status === 503 || status === 502);
