const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://plaidtuna:qi7cfPr52VQZ8A6TgoRZ2Q@blast-vole-35284.j77.aws-us-east-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full',
});

app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ mensaje: '¡Conexión exitosa!', hora: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar', detalle: error.message });
    }
});

app.post('/api/guardar-partida', async (req, res) => {
    const { usuario_id, puntaje, tiempo_jugado } = req.body;
    try {
        // 1. Asegurarnos de que el usuario exista antes de insertar la partida (evita el error de llave foránea)
        await pool.query(
            'INSERT INTO usuarios (id, nombre_usuario, correo, password_hash) VALUES (\$1, \$2, \$3, \$4) ON CONFLICT (id) DO NOTHING',
            [usuario_id, 'JugadorDefault', 'default@uniminuto.edu', '12345']
        );

        // 2. Guardar la partida
        const query = 'INSERT INTO partidas (usuario_id, puntaje, tiempo_jugado) VALUES (\$1, \$2, \$3) RETURNING *';
        const values = [usuario_id, puntaje, tiempo_jugado];
        
        const result = await pool.query(query, values);
        res.status(201).json({ mensaje: '¡Partida guardada con éxito!', partida: result.rows[0] });
    } catch (error) {
        console.error("Error al guardar la partida:", error.message);
        res.status(500).json({ error: 'Error al guardar la partida', detalle: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));