const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const app = express();

// Configuration de la base de données
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123',
    database: 'apphabbo1'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Database connected');
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public')); // Assure que le CSS est servi correctement
app.use(session({
    secret: 'your_secret',
    resave: false,
    saveUninitialized: false
}));

app.set('view engine', 'ejs');

// Middleware pour vérifier la connexion
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Route pour la page d'accueil
app.get('/', async (req, res) => {
    db.query('SELECT username FROM users', (err, users) => {
        if (err) {
            console.error(err);
            res.redirect('/login');
        } else {
            res.render('index', { user: req.session.user, users: users });
        }
    });
});
// Route pour la page de connexion
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            const user = results[0];
            bcrypt.compare(password, user.password, (err, result) => {
                if (result) {
                    req.session.user = user;
                    res.redirect('/');
                } else {
                    res.send('Mot de passe incorrect');
                }
            });
        } else {
            res.send('Utilisateur non trouvé');
        }
    });
});

// Route pour l'inscription
app.post('/register', (req, res) => {
    const { username, email, password, gender } = req.body;
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) throw err;
        db.query('INSERT INTO users (username, email, password, gender) VALUES (?, ?, ?, ?)', 
            [username, email, hashedPassword, gender], 
            (err, results) => {
                if (err) throw err;
                // Connexion automatique après inscription
                req.session.user = { username, email, gender };
                res.redirect('/');
            }
        );
    });
});

// Route pour la déconnexion
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) throw err;
        res.redirect('/');
    });
});

// Route pour la page des paramètres

app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const username = req.session.user.username;

    // Récupérer les tags associés à l'utilisateur connecté
    db.query('SELECT tag FROM user_tags WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.redirect('/settings');
        }

        // Si des tags existent, les passer à la vue
        const tags = results.map(row => row.tag);

        // Rendre la vue settings avec les tags et l'utilisateur
        res.render('settings', { user: req.session.user, tags: tags });
    });
});

app.post('/update-settings', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { email, password } = req.body;
    const userId = req.session.user.id;

    const updates = [];
    const values = [];

    if (email) {
        updates.push('email = ?');
        values.push(email);
    }
    if (password) {
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) throw err;
            updates.push('password = ?');
            values.push(hashedPassword);

            db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, 
                [...values, userId], 
                (err, results) => {
                    if (err) throw err;
                    res.redirect('/');
                }
            );
        });
    } else {
        db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, 
            [...values, userId], 
            (err, results) => {
                if (err) throw err;
                res.redirect('/');
            }
        );
    }
});


app.post('/update-tags', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { tags } = req.body;
    const tagsArray = JSON.parse(tags);
    const username = req.session.user.username;

    // Supprimer tous les tags de l'utilisateur
    db.query('DELETE FROM user_tags WHERE username = ?', [username], (err) => {
        if (err) {
            console.error(err);
            res.redirect('/settings');
        } else {
            // Ajouter les nouveaux tags
            if (tagsArray.length > 0) {
                const values = tagsArray.map(tag => [username, tag]);
                db.query('INSERT INTO user_tags (username, tag) VALUES ?', [values], (err) => {
                    if (err) {
                        console.error(err);
                        res.redirect('/settings');
                    } else {
                        res.redirect('/settings');
                    }
                });
            } else {
                // Si aucun tag, rediriger simplement
                res.redirect('/settings');
            }
        }
    });
});

// Route pour la gestion des grades du personnel
app.get('/staff', (req, res) => {
    db.query('SELECT users.username, grades.name AS grade_name, users.grade_id FROM users LEFT JOIN grades ON users.grade_id = grades.id', (err, results) => {
        if (err) throw err;

        // Filtrer les utilisateurs avec grade >= 2
        const users = results.filter(user => user.grade_id >= 2);

        // Passer les données utilisateur à la vue
        res.render('staff', { users, user: req.session.user });
    });
});

app.get('/profile/:username', (req, res) => {
    const username = req.params.username;
    db.query('SELECT users.username, users.email, users.gender, users.grade_id, grades.name AS grade_name FROM users LEFT JOIN grades ON users.grade_id = grades.id WHERE users.username = ?', [username], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            res.render('profile', { user: results[0] });
        } else {
            res.send('Utilisateur non trouvé');
        }
    });
});

// Démarrage du serveur
app.listen(3000, () => {
    console.log('Server running on port 3000');
});
