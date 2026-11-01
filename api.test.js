const { test, before, after } = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");

process.env.DB_FILE = path.join(os.tmpdir(), `encomendas-${Date.now()}.json`);
const servidor = require("../server");

let base;
before(() => new Promise((ok) => servidor.listen(0, () => { base = `http://localhost:${servidor.address().port}`; ok(); })));
after(() => servidor.close());

const req = (metodo, rota, corpo) =>
  fetch(base + rota, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });

const valida = (extra = {}) => ({
  cliente: "Ana", telefone: "(73) 99999-1234", produto: "Bolo de cenoura", dataEntrega: "2026-12-10", ...extra,
});

test("cria, lista, busca, atualiza e remove", async () => {
  let r = await req("POST", "/encomendas", valida());
  assert.equal(r.status, 201);
  const criada = await r.json();
  assert.equal(criada.status, "recebida");

  r = await req("GET", "/encomendas");
  assert.equal((await r.json()).length, 1);

  r = await req("GET", `/encomendas/${criada.id}`);
  assert.equal(r.status, 200);

  r = await req("PATCH", `/encomendas/${criada.id}`, { status: "em_preparo" });
  assert.equal((await r.json()).status, "em_preparo");

  r = await req("DELETE", `/encomendas/${criada.id}`);
  assert.equal(r.status, 204);

  r = await req("GET", `/encomendas/${criada.id}`);
  assert.equal(r.status, 404);
});

test("rejeita dados inválidos", async () => {
  let r = await req("POST", "/encomendas", { cliente: "Ana" });
  assert.equal(r.status, 400);
  r = await req("POST", "/encomendas", valida({ status: "xyz" }));
  assert.equal(r.status, 400);
  r = await req("POST", "/encomendas", valida({ dataEntrega: "10/12/2026" }));
  assert.equal(r.status, 400);
});

test("bônus: bloqueia a 6ª encomenda no mesmo dia", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await req("POST", "/encomendas", valida({ dataEntrega: "2026-12-20", cliente: `Cliente ${i}` }));
    assert.equal(r.status, 201);
  }
  let r = await req("POST", "/encomendas", valida({ dataEntrega: "2026-12-20" }));
  assert.equal(r.status, 409);

  r = await req("POST", "/encomendas", valida({ dataEntrega: "2026-12-21" }));
  assert.equal(r.status, 201);
  const { id } = await r.json();

  r = await req("PATCH", `/encomendas/${id}`, { dataEntrega: "2026-12-20" });
  assert.equal(r.status, 409);

  const lista = await (await req("GET", "/encomendas?data=2026-12-20")).json();
  r = await req("PATCH", `/encomendas/${lista[0].id}`, { status: "entregue" });
  assert.equal(r.status, 200);
});
