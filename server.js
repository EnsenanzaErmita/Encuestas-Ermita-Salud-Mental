const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path'); 
const ExcelJS = require('exceljs');

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

// =========================================================================
// 3. RUTAS DE LA API
// =========================================================================

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

// RUTA API: Guardar una nueva respuesta de encuesta con diagnóstico, asistente, edad y sexo
app.post('/api/surveys', (req, res) => {
    const { keyCategory, diagnostic, assistant, age, gender } = req.body;

    if (!keyCategory || !['tabaquismo', 'alcoholismo', 'adicciones'].includes(keyCategory)) {
        return res.status(400).json({ message: 'Categoría de encuesta no válida.' });
    }

    const sql = `
        INSERT INTO survey_responses (keyCategory, diagnostic, assistant, age, gender) 
        VALUES (?, ?, ?, ?, ?)
    `;
    
    db.query(sql, [keyCategory, diagnostic, assistant, age || null, gender || null], (err, result) => {
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






// RUTA API GENERAL: Agrupa contadores del mes actual agrupados estrictamente por cada asistente único
app.get('/api/admin-surveys', (req, res) => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const periodoActual = `${anio}-${mes}`; // Ejemplo: "2026-06"

    const sql = `
        SELECT 
            assistant,
            COUNT(CASE WHEN LOWER(keyCategory) = 'tabaquismo' THEN 1 END) AS tabaco,
            COUNT(CASE WHEN LOWER(keyCategory) = 'alcoholismo' THEN 1 END) AS alcohol,
            COUNT(CASE WHEN LOWER(keyCategory) = 'adicciones' THEN 1 END) AS adicciones,
            COUNT(id) AS total
        FROM survey_responses
        WHERE DATE_FORMAT(timestamp, '%Y-%m') = ? 
          AND assistant IS NOT NULL 
          AND assistant != ''
        GROUP BY assistant
        ORDER BY assistant ASC
    `;

    db.query(sql, [periodoActual], (err, results) => {
        if (err) {
            console.error('Error al consultar métricas por asistente:', err);
            return res.status(500).json({ message: 'Error interno del servidor.' });
        }
        res.status(200).json(results);
    });
});





// RUTA API NUEVA: Validar si un RFC existe en la tabla de empleados
app.post('/api/validate-rfc', (req, res) => {
    const { rfc } = req.body;
    
    if (!rfc) {
        return res.status(400).json({ valid: false, message: 'RFC no proporcionado.' });
    }

    // Buscamos de forma exacta el RFC en la tabla employees (convertido a mayúsculas)
    const sql = 'SELECT rfc FROM employees WHERE UPPER(rfc) = ?';
    db.query(sql, [rfc.toUpperCase().trim()], (err, results) => {
        if (err) {
            console.error('Error al validar RFC en la base de datos:', err);
            return res.status(500).json({ valid: false, message: 'Error interno en el servidor.' });
        }
        
        if (results.length > 0) {
            // El RFC existe, acceso concedido
            return res.status(200).json({ valid: true });
        } else {
            // El RFC no existe en el sistema
            return res.status(200).json({ valid: false });
        }
    });
});











// RUTA CORREGIDA: FILTRA RIGUROSAMENTE POR MES Y AÑO EN LA BASE DE DATOS
app.get('/api/reports/monthly-excel', async (req, res) => {
    try {
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        // Obtener mes y año actuales como valores por defecto
        const now = new Date();
        const reqYear = req.query.year ? parseInt(req.query.year, 10) : now.getFullYear();
        const reqMonth = req.query.month ? parseInt(req.query.month, 10) : (now.getMonth() + 1);

        const periodText = `${monthNames[reqMonth - 1].toUpperCase()} ${reqYear}`;

        // 1. Consulta SQL filtrada OBLIGATORIAMENTE por mes y año sobre el campo 'timestamp'
        // NOTA: Si en tu base de datos el campo se llama 'createdAt', cambia 'timestamp' por 'createdAt' en las funciones YEAR() y MONTH()
        const sql = `
            SELECT keyCategory, gender, age, diagnostic 
            FROM survey_responses 
            WHERE YEAR(timestamp) = ? AND MONTH(timestamp) = ?
        `;
        const params = [reqYear, reqMonth];

        // Ejecución de la consulta SQL
        let rows;
        if (typeof db.promise === 'function') {
            const [results] = await db.promise().query(sql, params);
            rows = results;
        } else if (db.query && db.query.constructor.name === 'AsyncFunction') {
            const [results] = await db.query(sql, params);
            rows = results;
        } else {
            rows = await new Promise((resolve, reject) => {
                db.query(sql, params, (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });
        }

        console.log(`[Excel Export] Encuestas encontradas para ${periodText}: ${rows.length}`);

        // 2. Definir rangos de edad
        const ageRanges = [
            '15-19', '20-24', '25-29', '30-34', '35-39', 
            '40-44', '45-49', '50-54', '55-59', '60-64', 
            '65-69', '70-74', '75 y Más'
        ];

        function getAgeRangeLabel(age) {
            const numAge = parseInt(age, 10);
            if (isNaN(numAge) || numAge < 15) return null;
            if (numAge >= 75) return '75 y Más';
            const start = Math.floor(numAge / 5) * 5;
            const end = start + 4;
            return `${start}-${end}`;
        }

        const categories = ['tabaquismo', 'alcoholismo', 'adicciones'];
        const genders = ['Femenino', 'Masculino'];
        const diagnostics = ['Bajo', 'Moderado', 'Sustancial', 'Severo'];

        // 3. Matriz de conteo inicializada en ceros
        const dataMap = {};
        categories.forEach(cat => {
            dataMap[cat] = {};
            genders.forEach(g => {
                dataMap[cat][g] = {};
                ageRanges.forEach(range => {
                    dataMap[cat][g][range] = { 'Bajo': 0, 'Moderado': 0, 'Sustancial': 0, 'Severo': 0 };
                });
            });
        });

        // 4. Mapear y clasificar los datos devueltos por la BD
        if (Array.isArray(rows)) {
            rows.forEach(row => {
                const cat = row.keyCategory ? row.keyCategory.toString().toLowerCase().trim() : null;
                const genderRaw = row.gender ? row.gender.toString().trim() : '';
                
                let gender = null;
                if (/femenino|mujer|f/i.test(genderRaw)) gender = 'Femenino';
                else if (/masculino|hombre|m/i.test(genderRaw)) gender = 'Masculino';

                const range = getAgeRangeLabel(row.age);
                const diag = row.diagnostic ? row.diagnostic.toString().trim() : null;

                if (dataMap[cat] && gender && dataMap[cat][gender] && range && diagnostics.includes(diag)) {
                    dataMap[cat][gender][range][diag]++;
                }
            });
        }

        // 5. Crear el libro de Excel
        const workbook = new ExcelJS.Workbook();

        categories.forEach(cat => {
            const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
            const worksheet = workbook.addWorksheet(catName);
            worksheet.views = [{ showGridLines: true }];

            // Títulos de encabezado
            const mainHeaderRow = worksheet.addRow([`REPORTE MENSUAL DE SALUD MENTAL - ${catName.toUpperCase()}`]);
            mainHeaderRow.font = { bold: true, size: 14, color: { argb: '1B5E20' } };
            worksheet.mergeCells(`A${mainHeaderRow.number}:E${mainHeaderRow.number}`);
            mainHeaderRow.getCell(1).alignment = { horizontal: 'center' };

            const monthHeaderRow = worksheet.addRow([`PERIODO / MES: ${periodText}`]);
            monthHeaderRow.font = { bold: true, size: 11, color: { argb: '333333' } };
            worksheet.mergeCells(`A${monthHeaderRow.number}:E${monthHeaderRow.number}`);
            monthHeaderRow.getCell(1).alignment = { horizontal: 'center' };

            genders.forEach(gender => {
                const genderTitle = gender === 'Femenino' ? 'MUJERES' : 'HOMBRES';

                worksheet.addRow([]);
                const titleRow = worksheet.addRow([`${catName.toUpperCase()} - ${genderTitle}`]);
                titleRow.font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
                titleRow.getCell(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: gender === 'Femenino' ? '880E4F' : '1565C0' }
                };
                worksheet.mergeCells(`A${titleRow.number}:E${titleRow.number}`);

                const headerRow = worksheet.addRow(['Rango de Edad', 'Bajo', 'Moderado', 'Sustancial', 'Severo']);
                headerRow.font = { bold: true };
                headerRow.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0E0E0' } };
                    cell.alignment = { horizontal: 'center' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });

                ageRanges.forEach(range => {
                    const counts = dataMap[cat][gender][range];
                    const row = worksheet.addRow([
                        range,
                        counts['Bajo'],
                        counts['Moderado'],
                        counts['Sustancial'],
                        counts['Severo']
                    ]);

                    row.getCell(1).alignment = { horizontal: 'center' };
                    for (let i = 2; i <= 5; i++) {
                        row.getCell(i).alignment = { horizontal: 'right' };
                    }

                    row.eachCell((cell) => {
                        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    });
                });
            });

            worksheet.columns.forEach(column => { column.width = 18; });
        });

        // 6. Enviar respuesta HTTP de descarga
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_Salud_Mental_${periodText.replace(/\s+/g, '_')}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error al generar el reporte Excel:', error);
        res.status(500).json({ message: 'Error interno al generar el archivo Excel.', errorDetail: error.message });
    }
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