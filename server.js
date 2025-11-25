const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'isabella2005',
  database: 'trendstore'
});

db.connect(err => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:', err);
  } else {
    console.log('Conectado ao MySQL (trendstore)');
  }
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// ========== CLIENTES ==========

app.post('/api/clientes', async (req, res) => {
  try {
    const { nome_completo, email, telefone, cpf, data_nascimento, senha } = req.body;

    const senha_hash = senha;

    const sql = `
      INSERT INTO clientes
        (nome_completo, email, telefone, cpf, data_nascimento, senha_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = await query(sql, [
      nome_completo,
      email,
      telefone,
      cpf,
      data_nascimento,
      senha_hash
    ]);

    res.status(201).json({ id_cliente: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar cliente' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const sql = 'SELECT id_cliente, nome_completo, senha_hash FROM clientes WHERE email = ?';
    const rows = await query(sql, [email]);

    if (rows.length === 0 || rows[0].senha_hash !== senha) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const cliente = rows[0];
    res.json({
      id_cliente: cliente.id_cliente,
      nome_completo: cliente.nome_completo
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

// ========== PRODUTOS ==========

app.get('/api/produtos', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM produtos');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

app.get('/api/produtos/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM produtos WHERE id_produto = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar produto' });
  }
});

// ========== FAVORITOS ==========

app.get('/api/clientes/:id_cliente/favoritos', async (req, res) => {
  try {
    const sql = `
      SELECT f.id_produto, p.nome, p.preco, p.imagem
      FROM favoritos f
      JOIN produtos p ON p.id_produto = f.id_produto
      WHERE f.id_cliente = ?
    `;
    const rows = await query(sql, [req.params.id_cliente]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar favoritos' });
  }
});

app.post('/api/clientes/:id_cliente/favoritos', async (req, res) => {
  try {
    const { id_produto } = req.body;
    const { id_cliente } = req.params;

    const existe = await query(
      'SELECT id_favorito FROM favoritos WHERE id_cliente = ? AND id_produto = ?',
      [id_cliente, id_produto]
    );

    if (existe.length === 0) {
      await query(
        'INSERT INTO favoritos (id_cliente, id_produto) VALUES (?, ?)',
        [id_cliente, id_produto]
      );
      return res.json({ favorito: true });
    } else {
      await query(
        'DELETE FROM favoritos WHERE id_cliente = ? AND id_produto = ?',
        [id_cliente, id_produto]
      );
      return res.json({ favorito: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar favorito' });
  }
});

// ========== CARRINHO ==========

async function getOrCreateCarrinho(id_cliente) {
  let rows = await query('SELECT * FROM carrinhos WHERE id_cliente = ?', [id_cliente]);
  if (rows.length === 0) {
    const result = await query(
      'INSERT INTO carrinhos (id_cliente) VALUES (?)',
      [id_cliente]
    );
    rows = [{ id_carrinho: result.insertId, id_cliente }];
  }
  return rows[0];
}

app.get('/api/clientes/:id_cliente/carrinho', async (req, res) => {
  try {
    const { id_cliente } = req.params;
    const carrinho = await getOrCreateCarrinho(id_cliente);
    const sql = `
      SELECT ic.id_item_carrinho, ic.id_produto, ic.quantidade, ic.preco_unitario,
             p.nome, p.imagem
      FROM itens_carrinho ic
      JOIN produtos p ON p.id_produto = ic.id_produto
      WHERE ic.id_carrinho = ?
    `;
    const itens = await query(sql, [carrinho.id_carrinho]);
    res.json({ id_carrinho: carrinho.id_carrinho, itens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar carrinho' });
  }
});

app.post('/api/clientes/:id_cliente/carrinho', async (req, res) => {
  try {
    const { id_cliente } = req.params;
    const { id_produto, quantidade, preco_unitario } = req.body;

    const carrinho = await getOrCreateCarrinho(id_cliente);

    const existe = await query(
      'SELECT * FROM itens_carrinho WHERE id_carrinho = ? AND id_produto = ?',
      [carrinho.id_carrinho, id_produto]
    );

    if (existe.length === 0) {
      await query(
        'INSERT INTO itens_carrinho (id_carrinho, id_produto, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
        [carrinho.id_carrinho, id_produto, quantidade, preco_unitario]
      );
    } else {
      await query(
        'UPDATE itens_carrinho SET quantidade = quantidade + ? WHERE id_item_carrinho = ?',
        [quantidade, existe[0].id_item_carrinho]
      );
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao adicionar ao carrinho' });
  }
});

app.delete('/api/clientes/:id_cliente/carrinho/:id_item', async (req, res) => {
  try {
    await query('DELETE FROM itens_carrinho WHERE id_item_carrinho = ?', [req.params.id_item]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover item do carrinho' });
  }
});

// ========== PEDIDOS ==========

app.post('/api/pedidos', async (req, res) => {
  try {
    const { id_cliente, id_endereco_entrega, total, itens } = req.body;

    if (!id_cliente || !id_endereco_entrega || !itens || itens.length === 0) {
      return res.status(400).json({ erro: 'Dados do pedido inválidos' });
    }

    const result = await query(
      'INSERT INTO pedidos (id_cliente, id_endereco_entrega, status, valor_total) VALUES (?, ?, ?, ?)',
      [id_cliente, id_endereco_entrega, 'em separacao', total]
    );
    const id_pedido = result.insertId;

    const valores = [];
    itens.forEach(item => {
      valores.push(id_pedido, item.id_produto, item.quantidade, item.preco_unitario);
    });

    const placeholders = itens.map(() => '(?, ?, ?, ?)').join(', ');

    await query(
      `INSERT INTO itens_pedido (id_pedido, id_produto, quantidade, preco_unitario)
       VALUES ${placeholders}`,
      valores
    );

    res.status(201).json({
      id_pedido,
      status: 'em separacao'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar pedido' });
  }
});

app.get('/api/clientes/:id_cliente/pedidos', async (req, res) => {
  try {
    const { id_cliente } = req.params;

    const pedidos = await query(
      'SELECT id_pedido, data_pedido, status, valor_total FROM pedidos WHERE id_cliente = ? ORDER BY data_pedido DESC',
      [id_cliente]
    );

    if (pedidos.length === 0) {
      return res.json([]);
    }

    const idsPedidos = pedidos.map(p => p.id_pedido);
    const placeholders = idsPedidos.map(() => '?').join(', ');

    const itens = await query(
      `SELECT ip.id_pedido,
              ip.id_produto,
              ip.quantidade,
              ip.preco_unitario,
              p.nome AS nome_produto
       FROM itens_pedido ip
       JOIN produtos p ON p.id_produto = ip.id_produto
       WHERE ip.id_pedido IN (${placeholders})`,
      idsPedidos
    );

    const mapaItens = {};
    itens.forEach(i => {
      if (!mapaItens[i.id_pedido]) mapaItens[i.id_pedido] = [];
      mapaItens[i.id_pedido].push({
        id_produto: i.id_produto,
        nome_produto: i.nome_produto,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario
      });
    });

    const resposta = pedidos.map(p => ({
      id_pedido: p.id_pedido,
      data_pedido: p.data_pedido,
      status: p.status,
      valor_total: p.valor_total,
      itens: mapaItens[p.id_pedido] || []
    }));

    res.json(resposta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// ========== CLIENTE (GET/PUT PARA "MEU CADASTRO") ==========

app.get('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query(
      'SELECT id_cliente, nome_completo, email, telefone, cpf, data_nascimento FROM clientes WHERE id_cliente = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar cliente' });
  }
});

app.put('/api/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome_completo, email, telefone, cpf, data_nascimento } = req.body;

    await query(
      `UPDATE clientes
         SET nome_completo   = ?,
             email           = ?,
             telefone        = ?,
             cpf             = ?,
             data_nascimento = ?
       WHERE id_cliente = ?`,
      [nome_completo, email, telefone, cpf, data_nascimento, id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar cliente' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API TrendStore rodando na porta ${PORT}`);
});