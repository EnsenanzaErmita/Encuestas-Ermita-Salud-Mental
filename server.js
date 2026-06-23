// VERSIÓN REPARADA DEL SERVIDOR - COMPILACIÓN LIMPIA
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path'); 

const app = express();

// 1. MIDDLEWARES
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname)); 

// 2. CONFIGURACIÓN DE BASE DE DATOS ADAPTATIVA (CLEVER CLOUD)
const dbConfig = {
    host: 'bqxquadwgh6wn3twrgyy-mysql.services.clever-cloud.com',
    user: 'usp9nsl8ipuiouao',
    password: 'vXf0fCll6xPxv7f6XV84',
    database: 'bqxquadwgh6wn3twrgyy',
    port: 3306
};

let db;

function handleDisconnect() {
    db = mysql.createConnection(dbConfig); // Crea una nueva conexión

    db.connect(err => {
        if (err) {
            console.error('Error al reconectar a MySQL, reintentando en 2 segundos...', err);
            setTimeout(handleDisconnect, 2000); // Si falla, espera 2 segundos y reintenta
        } else {
            console.log('¡Conexión exitosa y activa con la base de datos de Clever Cloud!');
        }
    });

    // Si la base de datos cierra el canal por inactividad, atrapamos el error aquí
    db.on('error', err => {
        console.error('Se detectó un error en el nodo de MySQL:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('Conexión perdida con la nube. Iniciando reconexión automática...');
            handleDisconnect(); // Reconectamos el servidor automáticamente
        } else {
            throw err;
        }
    });
}

// Inicializamos la conexión automática
handleDisconnect();

// Configuración de clave de administrador (puedes sobrescribirla usando variables de entorno en Render)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123*";

// =========================================================================
// 3. RUTAS DE LA API
// =========================================================================

// NUEVA RUTA API: Autenticar por RFC o Admin y extraer respuestas de Clever Cloud
app.post('/api/v1/auth', (req, res) => {
    const { pass } = req.body;

    if (!pass) {
        return res.status(400).json({ authorized: false, message: 'Contraseña o RFC requerido.' });
    }

    const cleanPass = pass.trim().toUpperCase();

    // Función interna para extraer los datos si la persona está autorizada
    const fetchSurveyResponses = () => {
        const sqlResponses = 'SELECT id, keyCategory, timestamp, diagnostic, assistant FROM survey_responses ORDER BY timestamp DESC';
        db.query(sqlResponses, (err, responsesResults) => {
            if (err) {
                console.error('Error al consultar respuestas de encuestas:', err);
                return res.status(500).json({ authorized: false, message: 'Error al extraer respuestas de la base de datos.' });
            }
            return res.status(200).json({
                authorized: true,
                responses: responsesResults || []
            });
        });
    };

    // Caso 1: Es la clave de Administrador
    if (cleanPass === ADMIN_PASSWORD.toUpperCase()) {
        return fetchSurveyResponses();
    }

    // Caso 2: No es admin, verificamos si es un RFC en la tabla 'employees'
    const sqlCheckRFC = 'SELECT id FROM employees WHERE UPPER(rfc) = ?';
    db.query(sqlCheckRFC, [cleanPass], (err, employeeResults) => {
        if (err) {
            console.error('Error al validar el RFC en la base de datos:', err);
            return res.status(500).json({ authorized: false, message: 'Error interno al validar credenciales.' });
        }

        if (employeeResults && employeeResults.length > 0) {
            // El RFC existe y está autorizado
            return fetchSurveyResponses();
        } else {
            // No es admin ni un RFC registrado
            return res.status(401).json({ authorized: false, message: 'Acceso denegado. No es un Administrador o RFC Autorizado.' });
        }
    });
});

// RUTA API: Obtener la lista de todos los empleados (Antes doctors)
app.get('/api/doctors', (req, res) => {
    // CAMBIO: Ahora consulta a la tabla employees
    const sql = 'SELECT rfc, name FROM employees ORDER BY name ASC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al consultar empleados:', err);
            return res.status(500).json({ message: 'Error al obtener los datos.' });
        }
        res.status(200).json(results);
    });
});



// RUTA API: Guardar empleados (Antes doctors)
app.post('/api/doctors', (req, res) => {
    const { rfc, name } = req.body;
    if (!rfc || !name) {
        return res.status(400).json({ message: 'El nombre y el RFC son campos obligatorios.' });
    }

    // CAMBIO: Ahora verifica en la tabla employees
    const checkSql = 'SELECT * FROM employees WHERE rfc = ?';
    db.query(checkSql, [rfc], (err, results) => {
        if (err) {
            console.error('Error al buscar RFC:', err);
            return res.status(500).json({ message: 'Error interno en el servidor.' });
        }
        if (results.length > 0) {
            return res.status(400).json({ message: 'Este RFC ya se encuentra registrado en el sistema.' });
        }

        // CAMBIO: Ahora inserta en la tabla employees
        const insertSql = 'INSERT INTO employees (rfc, name) VALUES (?, ?)';
        db.query(insertSql, [rfc, name], (err, result) => {
            if (err) {
                console.error('Error al insertar empleado:', err);
                return res.status(500).json({ message: 'No se pudieron guardar los datos.' });
            }
            res.status(201).json({ message: 'Personal guardado correctamente.' });
        });
    });
});





// RUTA API: Eliminar un empleado por su RFC
app.delete('/api/doctors/:rfc', (req, res) => {
    const { rfc } = req.params;

    const sql = 'DELETE FROM employees WHERE rfc = ?';
    db.query(sql, [rfc], (err, result) => {
        if (err) {
            console.error('Error al eliminar empleado:', err);
            return res.status(500).json({ message: 'Error interno al intentar eliminar.' });
        }
        res.status(200).json({ message: 'Usuario eliminado correctamente.' });
    });
});












// RUTA API: Guardar o actualizar la meta mensual
app.post('/api/goals', (req, res) => {
    const { month_year, goal_value } = req.body;
    if (!month_year || !goal_value) {
        return res.status(400).json({ message: 'El mes y el valor de la meta son obligatorios.' });
    }

    const sql = `
        INSERT INTO monthly_goals (month_year, goal_value) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE goal_value = ?
    `;
    db.query(sql, [month_year, goal_value, goal_value], (err, result) => {
        if (err) {
            console.error('Error al guardar meta:', err);
            return res.status(500).json({ message: 'Error interno al guardar la meta.' });
        }
        res.status(200).json({ message: 'Meta mensual guardada correctamente.' });
    });
});

// RUTA API: Guardar una nueva respuesta de encuesta con diagnóstico y asistente
app.post('/api/surveys', (req, res) => {
    const { keyCategory, diagnostic, assistant } = req.body;

    if (!keyCategory || !['tabaquismo', 'alcoholismo', 'adicciones'].includes(keyCategory)) {
        return res.status(400).json({ message: 'Categoría de encuesta no válida.' });
    }

    const sql = 'INSERT INTO survey_responses (keyCategory, diagnostic, assistant) VALUES (?, ?, ?)';
    db.query(sql, [keyCategory, diagnostic, assistant], (err, result) => {
        if (err) {
            console.error('Error al insertar encuesta:', err);
            return res.status(500).json({ message: 'Error interno al guardar la encuesta.' });
        }
        res.status(201).json({ message: 'Encuesta registrada con éxito.' });
    });
});

// RUTA API: Obtener estadísticas y contadores unificados
app.get('/api/stats', (req, res) => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const monthYear = `${anio}-${mes}`; 

    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM survey_responses WHERE keyCategory = 'tabaquismo') AS globalTabaco,
            (SELECT COUNT(*) FROM survey_responses WHERE keyCategory = 'alcoholismo') AS globalAlcohol,
            (SELECT COUNT(*) FROM survey_responses WHERE keyCategory = 'adicciones') AS globalAdicciones,
            (SELECT COUNT(*) FROM survey_responses WHERE keyCategory = 'tabaquismo' AND DATE_FORMAT(timestamp, '%Y-%m') = ?) AS monthTabaco,
            (SELECT COUNT(*) FROM survey_responses WHERE keyCategory = 'alcoholismo' AND DATE_FORMAT(timestamp, '%Y-%m') = ?) AS monthAlcohol,
            (SELECT COUNT(*) FROM survey_responses WHERE keyCategory = 'adicciones' AND DATE_FORMAT(timestamp, '%Y-%m') = ?) AS monthAdicciones,
            (SELECT goal_value FROM monthly_goals WHERE month_year = ?) AS savedGoal;
    `;

    db.query(sql, [monthYear, monthYear, monthYear, monthYear], (err, results) => {
        if (err) {
            console.error('Error al calcular estadísticas:', err);
            return res.status(500).json({ message: 'Error interno en el servidor.' });
        }

        // Extraemos de forma segura el primer registro de la fila única
        const stats = (results && results.length > 0) ? results[0] : {
            globalTabaco: 0, globalAlcohol: 0, globalAdicciones: 0,
            monthTabaco: 0, monthAlcohol: 0, monthAdicciones: 0, savedGoal: 0
        };

        if (stats.savedGoal === null) {
            stats.savedGoal = 0;
        }

        res.status(200).json(stats);
    });
});

// =========================================================================
// 4. RUTA PARA SERVIR EL HTML (Abajo de la API)
// =========================================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 5. ARRANCAR EL SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto: ${PORT}`);
});
