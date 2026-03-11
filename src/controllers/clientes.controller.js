import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { validateCliente, ValidationError } from '../validators/validators.js';

// =====================================================
// LISTAR CLIENTES
// =====================================================
export const getClientes = async (req, res) => {
  try {
    const { incluir_inactivos } = req.query;
    
    let query = `
      SELECT
        c.id,
        c.uuid,
        c.nombre,
        c.empresa,
        c.email,
        c.telefono,
        c.direccion,
        c.estado,
        c.fecha_registro,
        u.id AS user_id,
        u.email AS user_email
      FROM clientes c
      LEFT JOIN users u ON u.id = c.user_id
    `;
    
    if (incluir_inactivos !== 'true') {
      query += ` WHERE c.estado = 'activo'`;
    }
    
    query += ` ORDER BY c.fecha_registro DESC`;

    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error en getClientes:', error);
    res.status(500).json({ message: 'Error al obtener clientes' });
  }
};

// =====================================================
// OBTENER CLIENTE POR UUID
// =====================================================
export const getClienteByUuid = async (req, res) => {
  try {
    const { uuid } = req.params;
    
    const [rows] = await pool.query(`
      SELECT
        c.id,
        c.uuid,
        c.nombre,
        c.empresa,
        c.email,
        c.telefono,
        c.direccion,
        c.estado,
        c.fecha_registro,
        u.id AS user_id,
        u.email AS user_email,
        u.role
      FROM clientes c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.uuid = ?
    `, [uuid]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error en getClienteByUuid:', error);
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
};

// =====================================================
// CREAR CLIENTE (CON USUARIO)
// =====================================================
export const createCliente = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    validateCliente(req.body);

    const {
      nombre,
      empresa,
      email,
      password,
      telefono,
      direccion
    } = req.body;

    await connection.beginTransaction();

    let userId = null;
    let userUUID = null; // DECLARADO FUERA

    if (password) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Email ya registrado' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      userUUID = uuidv4(); // ASIGNADO

      const [userResult] = await connection.query(
        `INSERT INTO users (uuid, name, email, password, role, empresa)
         VALUES (?, ?, ?, ?, 'cliente', ?)`,
        [userUUID, nombre, email, hashedPassword, empresa]
      );

      userId = userResult.insertId;
    }

    const clienteUUID = uuidv4();

    await connection.query(
      `INSERT INTO clientes
       (uuid, user_id, nombre, empresa, email, telefono, direccion, estado, fecha_registro)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', CURDATE())`,
      [clienteUUID, userId, nombre, empresa, email, telefono || null, direccion || null]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Cliente creado correctamente',
      uuid: clienteUUID,
      user_uuid: userUUID
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error en createCliente:', error);
    res.status(500).json({ message: 'Error al crear cliente' });
  } finally {
    connection.release();
  }
};

// =====================================================
// ACTUALIZAR CLIENTE
// =====================================================
export const updateCliente = async (req, res) => {
  const { uuid } = req.params;
  const { nombre, empresa, email, telefono, direccion, password } = req.body;

  const connection = await pool.getConnection();

  try {
    // Validar contraseña si se proporciona
    if (password) {
      const { validatePassword } = await import('../validators/validators.js');
      validatePassword(password);
    }

    await connection.beginTransaction();

    const [cliente] = await connection.query(
      'SELECT user_id FROM clientes WHERE uuid = ?',
      [uuid]
    );

    if (cliente.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const userId = cliente[0].user_id;

    // Si tiene usuario asociado y cambiar el email
    if (userId && email) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Email ya está en uso' });
      }

      await connection.query(
        'UPDATE users SET email = ?, name = ?, empresa = ? WHERE id = ?',
        [email, nombre, empresa, userId]
      );
    }

    // Si se proporciona nueva contraseña, hashearla y actualizar
    if (userId && password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId]
      );
    }

    await connection.query(
      `UPDATE clientes 
       SET nombre = ?, empresa = ?, email = ?, telefono = ?, direccion = ?
       WHERE uuid = ?`,
      [nombre, empresa, email, telefono, direccion, uuid]
    );

    await connection.commit();

    res.json({ message: 'Cliente actualizado correctamente' });

  } catch (error) {
    await connection.rollback();
    
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: error.message,
        field: error.field 
      });
    }

    console.error('Error en updateCliente:', error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  } finally {
    connection.release();
  }
};

// =====================================================
// ELIMINAR CLIENTE (SOFT DELETE)
// =====================================================
export const deleteCliente = async (req, res) => {
  const { uuid } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE clientes SET estado = 'inactivo' WHERE uuid = ?`,
      [uuid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json({ message: 'Cliente inactivado correctamente' });
  } catch (error) {
    console.error('Error en deleteCliente:', error);
    res.status(500).json({ message: 'Error al inactivar cliente' });
  }
};

// =====================================================
// RESTAURAR CLIENTE
// =====================================================
export const restaurarCliente = async (req, res) => {
  const { uuid } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE clientes SET estado = 'activo' WHERE uuid = ? AND estado = 'inactivo'`,
      [uuid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado o ya está activo' });
    }

    res.json({ message: 'Cliente restaurado correctamente' });
  } catch (error) {
    console.error('Error en restaurarCliente:', error);
    res.status(500).json({ message: 'Error al restaurar cliente' });
  }
};