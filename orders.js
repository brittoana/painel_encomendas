const { getStore } = require("@netlify/blobs");

const VALID_STATUSES = [
  "Novo pedido",
  "Pago online",
  "Em preparo",
  "Pronto",
  "Entregue",
];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Painel e cardápio são o mesmo site, mas liberamos CORS
      // básico caso o painel seja aberto de outra origem no futuro.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  const store = getStore("orders");

  try {
    if (event.httpMethod === "GET") {
      const { blobs } = await store.list();

      const orders = (
        await Promise.all(
          blobs.map((entry) => store.get(entry.key, { type: "json" })),
        )
      ).filter(Boolean);

      orders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return jsonResponse(200, { orders });
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const { source, status, customer, items, total } = payload;

      if (!Array.isArray(items) || items.length === 0) {
        return jsonResponse(400, { error: "O pedido não tem itens." });
      }

      if (!customer || !customer.name || !customer.phone) {
        return jsonResponse(400, {
          error: "Dados do cliente incompletos (nome e telefone são obrigatórios).",
        });
      }

      const order = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        source: source === "online" ? "online" : "whatsapp",
        status: VALID_STATUSES.includes(status) ? status : "Novo pedido",
        customer,
        items,
        total: Number(total) || 0,
      };

      await store.setJSON(order.id, order);

      return jsonResponse(201, order);
    }

    if (event.httpMethod === "PATCH" || event.httpMethod === "PUT") {
      const payload = JSON.parse(event.body || "{}");
      const { id, status } = payload;

      if (!id || !status) {
        return jsonResponse(400, { error: "Informe id e status do pedido." });
      }

      if (!VALID_STATUSES.includes(status)) {
        return jsonResponse(400, {
          error: `Status inválido. Use um de: ${VALID_STATUSES.join(", ")}.`,
        });
      }

      const existing = await store.get(id, { type: "json" });

      if (!existing) {
        return jsonResponse(404, { error: "Pedido não encontrado." });
      }

      existing.status = status;
      existing.updatedAt = new Date().toISOString();

      await store.setJSON(id, existing);

      return jsonResponse(200, existing);
    }

    if (event.httpMethod === "DELETE") {
      const id =
        event.queryStringParameters && event.queryStringParameters.id;

      if (!id) {
        return jsonResponse(400, { error: "Informe o id do pedido a apagar." });
      }

      await store.delete(id);

      return jsonResponse(200, { deleted: true, id });
    }

    return jsonResponse(405, { error: "Método não permitido." });
  } catch (error) {
    console.error("Erro na função orders:", error);

    return jsonResponse(500, {
      error: "Erro interno ao processar pedidos.",
      details: error.message,
    });
  }
};
