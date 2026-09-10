const { MercadoPagoConfig, Preference } = require("mercadopago");

// Mantém os produtos e preços no servidor — nunca confie no preço
// vindo do navegador, para evitar que alguém manipule o valor pago.
const PRODUCTS = {
  tradicional: { name: "Brigadeiro Tradicional", price: 3.5 },
  nozes: { name: "Brigadeiro de Nozes", price: 3.5 },
  oreo: { name: "Brigadeiro de Oreo", price: 3.5 },
  churros: { name: "Brigadeiro de Churros", price: 3.5 },
  caixa4: { name: "Caixa com Quatro Brigadeiros", price: 12.0 },
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método não permitido." });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    console.error("MP_ACCESS_TOKEN não configurado nas variáveis de ambiente.");
    return jsonResponse(500, {
      error: "Pagamento online não está configurado no servidor.",
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Corpo da requisição inválido." });
  }

  const { items, customer, orderId } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse(400, { error: "O carrinho está vazio." });
  }

  const mpItems = [];

  for (const item of items) {
    const product = PRODUCTS[item?.productId];
    const quantity = Number(item?.quantity);

    if (!product || !Number.isInteger(quantity) || quantity <= 0) {
      return jsonResponse(400, { error: "Item inválido no carrinho." });
    }

    mpItems.push({
      id: item.productId,
      title: product.name,
      quantity,
      unit_price: product.price,
      currency_id: "BRL",
    });
  }

  const siteUrl = process.env.URL || `https://${event.headers.host}`;
  const phoneDigits = (customer?.phone || "").replace(/\D/g, "");

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: mpItems,
        payer: {
          name: customer?.name || undefined,
          phone: phoneDigits
            ? {
                area_code: phoneDigits.slice(0, 2),
                number: phoneDigits.slice(2),
              }
            : undefined,
        },
        back_urls: {
          success: `${siteUrl}/?pagamento=sucesso`,
          failure: `${siteUrl}/?pagamento=falhou`,
          pending: `${siteUrl}/?pagamento=pendente`,
        },
        auto_return: "approved",
        statement_descriptor: "DOCE GRACA",
        metadata: {
          order_id: orderId || "",
          customer_name: customer?.name || "",
          customer_phone: customer?.phone || "",
          delivery_type: customer?.deliveryType || "",
          address: customer?.address || "",
          reference: customer?.reference || "",
          desired_date: customer?.desiredDate || "",
          notes: customer?.notes || "",
        },
      },
    });

    if (!result?.init_point) {
      throw new Error("Mercado Pago não retornou o link de pagamento.");
    }

    return jsonResponse(200, { init_point: result.init_point });
  } catch (error) {
    console.error("Erro ao criar preferência no Mercado Pago:", error);

    return jsonResponse(500, {
      error: "Não foi possível iniciar o pagamento.",
      details: error?.message || "Erro desconhecido.",
    });
  }
};
