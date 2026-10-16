const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Configuración de la conexión a CockroachDB
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://plaidtuna:qi7cfPr52VQZ8A6TgoRZ2Q@blast-vole-35284.j77.aws-us-east-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full',
});

// Ruta de prueba para verificar la conexión
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ mensaje: '¡Conexión exitosa!', hora: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar', detalle: error.message });
    }
});

// Ruta para GUARDAR O SOBREESCRIBIR la partida del usuario (Evita duplicados)
app.post('/api/guardar-partida', async (req, res) => {
    const { usuario_id, puntaje, tiempo_jugado, posicion_x, posicion_y } = req.body;
    try {
        // 1. Asegurarnos de que el usuario exista
        await pool.query(
            'INSERT INTO usuarios (id, nombre_usuario, correo, password_hash) VALUES (\$1, \$2, \$3, \$4) ON CONFLICT (id) DO NOTHING',
            [usuario_id, 'JugadorDefault', 'default@uniminuto.edu', '12345']
        );

        // 2. Sobrescribir (Upsert) la partida del usuario si ya existe basándose en la llave única o usuario_id
        const query = `
            INSERT INTO partidas (usuario_id, puntaje, tiempo_jugado, posicion_x, posicion_y, fecha_partida) 
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (usuario_id) 
            DO UPDATE SET 
                puntaje = EXCLUDED.puntaje,
                tiempo_jugado = EXCLUDED.tiempo_jugado,
                posicion_x = EXCLUDED.posicion_x,
                posicion_y = EXCLUDED.posicion_y,
                fecha_partida = NOW()
            RETURNING *;
        `;
        const values = [usuario_id, puntaje, tiempo_jugado, posicion_x || 0, posicion_y || 0];
        
        const result = await pool.query(query, values);
        res.status(200).json({ mensaje: '¡Partida sobrescrita y guardada con éxito!', partida: result.rows[0] });
    } catch (error) {
        console.error("Error al guardar la partida:", error.message);
        res.status(500).json({ error: 'Error al guardar la partida', detalle: error.message });
    }
});

// Ruta para cargar la partida específica del usuario
app.get('/api/cargar-partida/:usuario_id', async (req, res) => {
    const { usuario_id } = req.params;
    try {
        const query = 'SELECT * FROM partidas WHERE usuario_id = \$1 LIMIT 1';
        const result = await pool.query(query, [usuario_id]);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'No se encontró ninguna partida guardada para este usuario' });
        }
    } catch (error) {
        console.error("Error al cargar la partida:", error.message);
        res.status(500).json({ error: 'Error al cargar', detalle: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));