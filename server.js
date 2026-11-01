// API de Encomendas - Café do Bairro (TecnoJr)
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const LIMITE_POR_DIA = 5; 
const STATUS_VALIDOS = ["recebida", "em_preparo", "entregue"];
const ARQUIVO = process.env.DB_FILE || path.join(__dirname, "data", "encomendas.json");

function carregar() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
  } catch {
    return [];
  }
}

function salvar(encomendas) {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(encomendas, null, 2));
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(texto + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === texto;
}

function validar(dados, parcial = false) {
  const erros = [];
  const campos = ["cliente", "telefone", "produto", "dataEntrega"];

  for (const c of campos) {
    if (dados[c] === undefined) {
      if (!parcial) erros.push(`O campo "${c}" é obrigatório.`);
      continue;
    }
    if (typeof dados[c] !== "string" || dados[c].trim() === "") {
      erros.push(`O campo "${c}" deve ser um texto não vazio.`);
    }
  }

  if (typeof dados.telefone === "string" && dados.telefone.trim() !== "") {
    const digitos = dados.telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11) {
      erros.push('O campo "telefone" deve ter DDD + número (10 ou 11 dígitos).');
    }
  }

  if (typeof dados.dataEntrega === "string" && dados.dataEntrega.trim() !== "") {
    if (!dataValida(dados.dataEntrega)) {
      erros.push('O campo "dataEntrega" deve estar no formato AAAA-MM-DD.');
    }
  }

  if (dados.status !== undefined && !STATUS_VALIDOS.includes(dados.status)) {
    erros.push(`O campo "status" deve ser um de: ${STATUS_VALIDOS.join(", ")}.`);
  }

  return erros;
}

function contarNoDia(encomendas, data, ignorarId) {
  return encomendas.filter((e) => e.dataEntrega === data && e.id !== ignorarId).length;
}

function responder(res, status, corpo) {
  if (status === 204) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let texto = "";
    req.on("data", (pedaco) => {
      texto += pedaco;
      if (texto.length > 1e5) reject(new Error("Corpo da requisição muito grande."));
    });
    req.on("end", () => {
      if (!texto) return resolve({});
      try {
        const obj = JSON.parse(texto);
        if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
          return reject(new Error("O corpo deve ser um objeto JSON."));
        }
        resolve(obj);
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
  });
}

function limpar(dados) {
  const saida = {};
  for (const c of ["cliente", "telefone", "produto", "dataEntrega", "status"]) {
    if (dados[c] !== undefined) {
      saida[c] = typeof dados[c] === "string" ? dados[c].trim() : dados[c];
    }
  }
  return saida;
}

const msgLimite = (data) =>
  `Limite de ${LIMITE_POR_DIA} encomendas por dia atingido para ${data}. Escolha outra data.`;

async function tratar(req, res) {
  const url = new URL(req.url, "http://localhost");
  const partes = url.pathname.split("/").filter(Boolean);

  if (partes[0] !== "encomendas" || partes.length > 2) {
    return responder(res, 404, { erro: "Rota não encontrada." });
  }
  const id = partes[1];
  const encomendas = carregar();

  if (req.method === "GET" && !id) {
    let lista = encomendas;
    const data = url.searchParams.get("data");
    const status = url.searchParams.get("status");
    if (data) lista = lista.filter((e) => e.dataEntrega === data);
    if (status) lista = lista.filter((e) => e.status === status);
    lista = [...lista].sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
    return responder(res, 200, lista);
  }

  if (req.method === "GET" && id) {
    const e = encomendas.find((x) => x.id === id);
    return e ? responder(res, 200, e) : responder(res, 404, { erro: "Encomenda não encontrada." });
  }

  if (req.method === "POST" && !id) {
    const dados = limpar(await lerCorpo(req));
    const erros = validar(dados);
    if (erros.length) return responder(res, 400, { erros });

    if (contarNoDia(encomendas, dados.dataEntrega) >= LIMITE_POR_DIA) {
      return responder(res, 409, { erro: msgLimite(dados.dataEntrega) });
    }

    const nova = {
      id: randomUUID(),
      cliente: dados.cliente,
      telefone: dados.telefone,
      produto: dados.produto,
      dataEntrega: dados.dataEntrega,
      status: dados.status || "recebida",
      criadaEm: new Date().toISOString(),
    };
    encomendas.push(nova);
    salvar(encomendas);
    return responder(res, 201, nova);
  }
  if ((req.method === "PUT" || req.method === "PATCH") && id) {
    const indice = encomendas.findIndex((x) => x.id === id);
    if (indice === -1) return responder(res, 404, { erro: "Encomenda não encontrada." });

    const dados = limpar(await lerCorpo(req));
    const erros = validar(dados, true);
    if (erros.length) return responder(res, 400, { erros });

    const atual = encomendas[indice];
    if (dados.dataEntrega && dados.dataEntrega !== atual.dataEntrega) {
      if (contarNoDia(encomendas, dados.dataEntrega, id) >= LIMITE_POR_DIA) {
        return responder(res, 409, { erro: msgLimite(dados.dataEntrega) });
      }
    }

    encomendas[indice] = { ...atual, ...dados, id: atual.id, atualizadaEm: new Date().toISOString() };
    salvar(encomendas);
    return responder(res, 200, encomendas[indice]);
  }

  if (req.method === "DELETE" && id) {
    const restantes = encomendas.filter((x) => x.id !== id);
    if (restantes.length === encomendas.length) {
      return responder(res, 404, { erro: "Encomenda não encontrada." });
    }
    salvar(restantes);
    return responder(res, 204);
  }

  return responder(res, 405, { erro: "Método não permitido." });
}

const servidor = http.createServer((req, res) => {
  tratar(req, res).catch((err) => {
    const cliente = ["JSON inválido.", "O corpo deve ser um objeto JSON.", "Corpo da requisição muito grande."];
    if (cliente.includes(err.message)) return responder(res, 400, { erro: err.message });
    console.error(err);
    responder(res, 500, { erro: "Erro interno do servidor." });
  });
});

if (require.main === module) {
  const porta = process.env.PORT || 3000;
  servidor.listen(porta, () => console.log(`API de encomendas rodando em http://localhost:${porta}`));
}

module.exports = servidor;
