const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Configuración de la conexión a CockroachDB
const pool = new Pool({
  connectionString: 'postgresql://plaidtuna:hvUVSGX319Gp80Cge260Zg@blast-vole.gcp-us-central1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full',
});

// Ruta de prueba para verificar la conexión con la base de datos
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ mensaje: '¡Conexión exitosa desde el backend a CockroachDB!', hora: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar con la BD', detalle: error.message });
    }
});

// Ruta para guardar partidas enviadas desde Unity
app.post('/api/guardar-partida', async (req, res) => {
    const { usuario_id, puntaje, tiempo_jugado } = req.body;
    try {
        const query = 'INSERT INTO partidas (usuario_id, puntaje, tiempo_jugado) VALUES (\$1, \$2, \$3) RETURNING *';
        const values = [usuario_id, puntaje, tiempo_jugado];
        
        const result = await pool.query(query, values);
        res.status(201).json({ mensaje: '¡Partida guardada con éxito!', partida: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar la partida', detalle: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));