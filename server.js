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

// Guardar o actualizar la partida asegurando el usuario
app.post('/api/guardar-partida', async (req, res) => {
    const { usuario_id, puntaje, tiempo_jugado, posicion_x, posicion_y } = req.body;
    try {
        await pool.query(
            'INSERT INTO usuarios (id, nombre_usuario, correo, password_hash) VALUES (\$1, \$2, \$3, \$4) ON CONFLICT (id) DO NOTHING',
            [usuario_id || 121908949023752200, 'JugadorDefault', 'default@uniminuto.edu', '12345']
        );

        const idUsar = usuario_id || 121908949023752200;
        const existePartida = await pool.query('SELECT id FROM partidas WHERE usuario_id = \$1', [idUsar]);

        let result;
        if (existePartida.rows.length > 0) {
            const updateQuery = `
                UPDATE partidas 
                SET puntaje = $1, tiempo_jugado = $2, posicion_x = $3, posicion_y = $4, fecha_partida = NOW() 
                WHERE usuario_id = $5 
                RETURNING *;
            `;
            result = await pool.query(updateQuery, [puntaje, tiempo_jugado, posicion_x || 0, posicion_y || 0, idUsar]);
        } else {
            const insertQuery = `
                INSERT INTO partidas (usuario_id, puntaje, tiempo_jugado, posicion_x, posicion_y, fecha_partida) 
                VALUES ($1, $2, $3, $4, $5, NOW()) 
                RETURNING *;
            `;
            result = await pool.query(insertQuery, [idUsar, puntaje, tiempo_jugado, posicion_x || 0, posicion_y || 0]);
        }

        res.status(200).json({ mensaje: '¡Partida guardada/actualizada con éxito!', partida: result.rows[0] });
    } catch (error) {
        console.error("Error al guardar la partida:", error.message);
        res.status(500).json({ error: 'Error al guardar la partida', detalle: error.message });
    }
});

// Ruta para cargar siempre la última partida registrada de manera general
app.get('/api/cargar-partida', async (req, res) => {
    try {
        const query = 'SELECT * FROM partidas ORDER BY fecha_partida DESC LIMIT 1';
        const result = await pool.query(query);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'No se encontró ninguna partida guardada' });
        }
    } catch (error) {
        console.error("Error al cargar la partida:", error.message);
        res.status(500).json({ error: 'Error al cargar', detalle: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));