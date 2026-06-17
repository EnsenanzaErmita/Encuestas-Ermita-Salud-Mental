const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path'); // Módulo nativo para manejar rutas de archivos

const app = express();

// 1. MIDDLEWARES (Configuraciones de seguridad y lectura de datos)
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname)); // Permite cargar CSS/JS locales si tu HTML los usa

// 2. CONFIGURACIÓN DE TU BASE DE DATOS EN LA NUBE (CLEVER CLOUD)
const db = mysql.createConnection({
    host: 'bqxquadwgh6wn3twrgyy-mysql.services.clever-cloud.com',
    user: 'usp9nsl8ipuiouao',
    password: 'vXf0fCll6xPxv7f6XV84',
    database: 'bqxquadwgh6wn3twrgyy',
    port: 3306
});

// Conexión inicial a MySQL
db.connect(err => {
    if (err) {
        console.error('Error crítico al conectar a MySQL:', err);
        return;
    }
    console.log('¡Conexión exitosa a la base de datos de Clever Cloud!');
});

// 3. RUTA PARA SERVIR EL HTML (Para cuando tu app esté en internet)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. RUTA API: Guarda los datos en la tabla "doctors"
app.post('/api/doctors', (req, res) => {
    const { rfc, name } = req.body;

    if (!rfc || !name) {
        return res.status(400).json({ message: 'El nombre y el RFC son campos obligatorios.' });
    }

    // Validar si el RFC ya existe
    const checkSql = 'SELECT * FROM doctors WHERE rfc = ?';
    db.query(checkSql, [rfc], (err, results) => {
        if (err) {
            console.error('Error al buscar RFC:', err);
            return res.status(500).json({ message: 'Error interno en el servidor.' });
        }

        if (results.length > 0) {
            return res.status(400).json({ message: 'Este RFC ya se encuentra registrado en el sistema.' });
        }

        // Insertar el nuevo registro
        const insertSql = 'INSERT INTO doctors (rfc, name) VALUES (?, ?)';
        db.query(insertSql, [rfc, name], (err, result) => {
            if (err) {
                console.error('Error al insertar doctor:', err);
                return res.status(500).json({ message: 'No se pudieron guardar los datos en la base de datos.' });
            }
            res.status(201).json({ message: 'Doctor guardado correctamente.' });
        });
    });
});

// 5. ARRANCAR EL SERVIDOR (Puerto dinámico para Hosting o 3000 local)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto: ${PORT}`);
});
