const express = require('express');
const { Pool } = require('pg');
const pgTypes = require('pg').types;
const PDFDocument = require('pdfkit'); // Librería para generar los reportes en PDF

const app = express();
app.use(express.json());

// =====================================================================
// CONEXIÓN 1: CockroachDB (lo que ya tenías)
// =====================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://plaidtuna:qi7cfPr52VQZ8A6TgoRZ2Q@blast-vole-35284.j77.aws-us-east-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full',
});

// =====================================================================
// CONEXIÓN 2: Parte 2 - Servidor A (5432) que consulta al B (5433) vía postgres_fdw
// =====================================================================
const poolFdw = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'juego',
    user: 'postgres',
    password: '123', // <-- cámbiala por la clave de tu Postgres del puerto 5432
    // Solo en este pool: bigint (OID 20) como número. No afecta a CockroachDB.
    types: {
        getTypeParser: (oid, format) =>
            oid === 20 ? (v) => parseInt(v, 10) : pgTypes.getTypeParser(oid, format),
    },
});

// =====================================================================
// RUTAS ORIGINALES (CockroachDB)
// =====================================================================

// Ruta de prueba para verificar la conexión
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ mensaje: '¡Conexión exitosa!', hora: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar', detalle: error.message });
    }
});

// Ruta para guardar o actualizar la partida (Evita duplicados y sobrescribe)
app.post('/api/guardar-partida', async (req, res) => {
    const { usuario_id, puntaje, tiempo_jugado, posicion_x, posicion_y } = req.body;
    try {
        await pool.query(
            'INSERT INTO usuarios (id, nombre_usuario, correo, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
            [usuario_id || 121908949023752200, 'JugadorDefault', 'default@uniminuto.edu', '12345']
        );

        const idUsar = usuario_id || 121908949023752200;
        const existePartida = await pool.query('SELECT id FROM partidas WHERE usuario_id = $1', [idUsar]);

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

// --- REPORTES EN PDF (Requerimiento Universitario) ---

// 1. Reporte en PDF de Usuarios
app.get('/api/reporte/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre_usuario, correo FROM usuarios ORDER BY id ASC');

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Usuarios.pdf');
        doc.pipe(res);

        doc.fontSize(20).fillColor('#2c3e50').text('UNIMINUTO - Reporte del Sistema', { align: 'center' });
        doc.fontSize(12).fillColor('#7f8c8d').text('Reporte Oficial de Usuarios Registrados', { align: 'center' });
        doc.moveDown();

        doc.fontSize(10).fillColor('#000000');
        doc.text(`Identificación del Reporte: REP-USR-001`, { align: 'left' });
        doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, { align: 'left' });
        doc.moveDown(2);

        doc.fontSize(14).fillColor('#2980b9').text('Listado de Usuarios en Base de Datos:', { underline: true });
        doc.moveDown();

        result.rows.forEach((user, index) => {
            doc.fontSize(11).fillColor('#333333').text(
                `${index + 1}. ID: ${user.id}  |  Usuario: ${user.nombre_usuario}  |  Correo: ${user.correo}`
            );
            doc.moveDown(0.5);
        });

        doc.moveDown(4);
        doc.fontSize(9).fillColor('#95a5a6').text('Documento generado automáticamente desde CockroachDB - Sistema Uniminuto.', { align: 'center' });

        doc.end();
    } catch (error) {
        console.error("Error al generar reporte de usuarios:", error);
        res.status(500).json({ error: 'Error al generar el reporte PDF' });
    }
});

// 2. Reporte en PDF de Partidas y Progreso
app.get('/api/reporte/partidas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM partidas ORDER BY fecha_partida DESC');

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Partidas.pdf');
        doc.pipe(res);

        doc.fontSize(20).fillColor('#2c3e50').text('UNIMINUTO - Reporte de Progreso', { align: 'center' });
        doc.fontSize(12).fillColor('#7f8c8d').text('Historial de Partidas y Coordenadas Guardadas', { align: 'center' });
        doc.moveDown();

        doc.fontSize(10).fillColor('#000000');
        doc.text(`Identificación del Reporte: REP-PAR-002`, { align: 'left' });
        doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, { align: 'left' });
        doc.moveDown(2);

        doc.fontSize(14).fillColor('#2980b9').text('Registro de Partidas Activas:', { underline: true });
        doc.moveDown();

        result.rows.forEach((partida, index) => {
            doc.fontSize(10).fillColor('#333333').text(
                `${index + 1}. Partida ID: ${partida.id} | Usuario ID: ${partida.usuario_id}\n` +
                `    Puntaje: ${partida.puntaje} | Tiempo: ${partida.tiempo_jugado}s | Pos(X,Y): (${partida.posicion_x}, ${partida.posicion_y})\n` +
                `    Última actualización: ${partida.fecha_partida}`
            );
            doc.moveDown(1);
        });

        doc.moveDown(4);
        doc.fontSize(9).fillColor('#95a5a6').text('Documento generado automáticamente desde CockroachDB - Sistema Uniminuto.', { align: 'center' });

        doc.end();
    } catch (error) {
        console.error("Error al generar reporte de partidas:", error);
        res.status(500).json({ error: 'Error al generar el reporte PDF' });
    }
});

// =====================================================================
// PARTE 2: RUTAS NUEVAS /api/fdw/... (Postgres local A + B vía postgres_fdw)
// =====================================================================

app.get('/api/fdw/test', async (req, res) => {
    try {
        const r = await poolFdw.query('SELECT NOW()');
        res.json({ mensaje: '¡Conexión FDW exitosa!', hora: r.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al conectar', detalle: error.message });
    }
});

// Guardar o actualizar: una fila por jugador y nivel
app.post('/api/fdw/guardar-partida', async (req, res) => {
    const usuario_id = req.body.usuario_id || 1;
    const nivel_id = req.body.nivel_id || 1;
    const { puntaje, tiempo_jugado } = req.body;
    const posicion_x = req.body.posicion_x || 0;
    const posicion_y = req.body.posicion_y || 0;

    try {
        // Tablas locales del servidor A
        await poolFdw.query(
            `INSERT INTO jugador (id, nombre, correo) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
            [usuario_id, 'JugadorDefault', 'default@uniminuto.edu']
        );
        await poolFdw.query(
            `INSERT INTO nivel (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
            [nivel_id, 'Nivel ' + nivel_id]
        );

        // Tabla foránea (servidor B): primero UPDATE, si no hay fila entonces INSERT
        let result = await poolFdw.query(
            `UPDATE partida SET puntaje=$1, tiempo_jugado=$2, posicion_x=$3, posicion_y=$4, fecha_partida=NOW()
             WHERE usuario_id=$5 AND nivel_id=$6 RETURNING *`,
            [puntaje, tiempo_jugado, posicion_x, posicion_y, usuario_id, nivel_id]
        );

        if (result.rowCount === 0) {
            result = await poolFdw.query(
                `INSERT INTO partida (id, usuario_id, nivel_id, puntaje, tiempo_jugado, posicion_x, posicion_y, fecha_partida)
                 VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM partida), $1,$2,$3,$4,$5,$6, NOW()) RETURNING *`,
                [usuario_id, nivel_id, puntaje, tiempo_jugado, posicion_x, posicion_y]
            );
        }
        res.status(200).json({ mensaje: '¡Partida guardada/actualizada con éxito!', partida: result.rows[0] });
    } catch (error) {
        console.error('Error FDW guardar:', error.message);
        res.status(500).json({ error: 'Error al guardar la partida', detalle: error.message });
    }
});

// Cargar la última partida del jugador (JOIN entre los dos servidores)
app.get('/api/fdw/cargar-partida', async (req, res) => {
    const usuario_id = req.query.usuario_id || 1;
    try {
        const result = await poolFdw.query(
            `SELECT p.id, p.usuario_id, p.nivel_id, p.puntaje, p.tiempo_jugado,
                    p.posicion_x, p.posicion_y, p.fecha_partida,
                    j.nombre AS jugador, n.nombre AS nivel
             FROM partida p
             JOIN jugador j ON j.id = p.usuario_id
             JOIN nivel n ON n.id = p.nivel_id
             WHERE p.usuario_id = $1
             ORDER BY p.fecha_partida DESC LIMIT 1`,
            [usuario_id]
        );
        if (result.rows.length > 0) res.status(200).json(result.rows[0]);
        else res.status(404).json({ error: 'No se encontró ninguna partida guardada' });
    } catch (error) {
        console.error('Error FDW cargar:', error.message);
        res.status(500).json({ error: 'Error al cargar', detalle: error.message });
    }
});

// Reporte PDF distribuido
app.get('/api/fdw/reporte/partidas', async (req, res) => {
    try {
        const result = await poolFdw.query(
            `SELECT p.id, j.nombre AS jugador, n.nombre AS nivel, p.puntaje, p.tiempo_jugado,
                    p.posicion_x, p.posicion_y, p.fecha_partida
             FROM partida p
             JOIN jugador j ON j.id = p.usuario_id
             JOIN nivel n ON n.id = p.nivel_id
             ORDER BY p.fecha_partida DESC`
        );
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_FDW_Partidas.pdf');
        doc.pipe(res);

        doc.fontSize(20).fillColor('#2c3e50').text('UNIMINUTO - Reporte Distribuido', { align: 'center' });
        doc.fontSize(12).fillColor('#7f8c8d').text('Postgres (jugador, nivel) + Postgres remoto (partida) vía postgres_fdw', { align: 'center' });
        doc.moveDown(2);

        result.rows.forEach((p, i) => {
            doc.fontSize(10).fillColor('#333333').text(
                `${i + 1}. Partida ${p.id} | ${p.jugador} | ${p.nivel}\n` +
                `    Puntaje: ${p.puntaje} | Tiempo: ${p.tiempo_jugado}s | Pos: (${p.posicion_x}, ${p.posicion_y})\n` +
                `    Actualizada: ${p.fecha_partida}`
            );
            doc.moveDown(1);
        });
        doc.end();
    } catch (error) {
        console.error('Error FDW reporte:', error.message);
        res.status(500).json({ error: 'Error al generar el reporte PDF' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
