# API de Encomendas — Café do Bairro (TecnoJr)

Controle de encomendas da Dona Marta: nada de caderno, nada de bolo marcado duas vezes.

## Como rodar
Requer Node.js V18 ou superior (testado na V22).

    npm start        # sobe em http://localhost:3000
    npm test         # roda os testes

Os dados ficam em `data/encomendas.json`.

## Modelo de encomenda
| Campo | Tipo | Observação |
|---|---|---|
| id | texto | gerado automaticamente |
| cliente | texto | obrigatório |
| telefone | texto | obrigatório, DDD + número |
| produto | texto | obrigatório |
| dataEntrega | texto | obrigatório, formato `AAAA-MM-DD` |
| status | texto | `recebida` (padrão), `em_preparo`, `entregue` |

## Endpoints
| Método | Rota | O que faz |
|---|---|---|
| POST | /encomendas | Cria encomenda (201) |
| GET | /encomendas | Lista; filtros `?data=AAAA-MM-DD` e `?status=recebida` |
| GET | /encomendas/:id | Busca uma |
| PUT/PATCH | /encomendas/:id | Atualiza (campos parciais aceitos) |
| DELETE | /encomendas/:id | Remove (204) |

## limite de 5 por dia
Se o dia da entrega já tem 5 encomendas, criar uma nova ou remarcar outra para esse dia retorna **409 Conflict** com mensagem clara. Mudar o status de uma encomenda de um dia lotado continua funcionando.

## Exemplo
    curl -X POST localhost:3000/encomendas -H "Content-Type: application/json" \
      -d '{"cliente":"Ana","telefone":"73999991234","produto":"Bolo de cenoura","dataEntrega":"2026-12-10"}'

## Códigos de erro
400 dados inválidos · 404 não encontrada · 409 dia lotado

