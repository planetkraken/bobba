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


app.post('/add-tag', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Non autorisé' });
    }

    const username = req.session.user.username;
    const { tag } = req.body;

    db.query('INSERT INTO user_tags (username, tag) VALUES (?, ?)', [username, tag], (err) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Erreur lors de l\'ajout du tag' });
        }
        res.json({ success: true });
    });
});

app.post('/remove-tag', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Non autorisé' });
    }

    const username = req.session.user.username;
    const { tag } = req.body;

    db.query('DELETE FROM user_tags WHERE username = ? AND tag = ?', [username, tag], (err) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Erreur lors de la suppression du tag' });
        }
        res.json({ success: true });
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

    // Récupérer les informations de l'utilisateur
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, userResults) => {
        if (err || userResults.length === 0) {
            return res.status(404).send('Utilisateur non trouvé');
        }

        const user = userResults[0];

        // Récupérer les tags associés à cet utilisateur
        db.query('SELECT tag FROM user_tags WHERE username = ?', [username], (err, tagResults) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Erreur lors de la récupération des tags');
            }

            const tags = tagResults.map(row => row.tag);

            // Rendre la vue profile avec les infos de l'utilisateur et ses tags
            res.render('profile', { user: user, tags: tags });
        });
    });
});




app.get('/news', (req, res) => {
    db.query('SELECT * FROM articles', (err, articles) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erreur lors de la récupération des articles');
        }

        const user = req.session.user || null;
        res.render('news', { articles, article: null, comments: [], user });
    });
});

// Route pour afficher un article spécifique
app.get('/news/:id', (req, res) => {
    const articleId = req.params.id;
    const user = req.session.user;

    // Récupérer l'article sélectionné
    db.query('SELECT * FROM articles WHERE id = ?', [articleId], (err, articleResult) => {
        if (err || articleResult.length === 0) {
            return res.status(404).send('Article non trouvé');
        }

        const article = articleResult[0];

        // Récupérer les commentaires associés à cet article
        db.query('SELECT comments.*, users.username FROM comments JOIN users ON comments.user_id = users.id WHERE article_id = ? ORDER BY comments.created_at DESC', [articleId], (err, comments) => {
            if (err) {
                return res.status(500).send('Erreur lors de la récupération des commentaires');
            }

            let userReaction = null;

            // Si l'utilisateur est connecté, récupérer sa réaction
            if (user) {
                db.query('SELECT reaction_type FROM reactions WHERE user_id = ? AND article_id = ?', [user.id, articleId], (err, reactionResult) => {
                    if (err) {
                        return res.status(500).send('Erreur lors de la récupération des réactions');
                    }

                    if (reactionResult.length > 0) {
                        userReaction = reactionResult[0].reaction_type;
                    }

                    // Récupérer la liste des articles pour le menu à gauche
                    db.query('SELECT * FROM articles ORDER BY created_at DESC', (err, articles) => {
                        if (err) {
                            return res.status(500).send('Erreur lors de la récupération des articles');
                        }

                        res.render('news', { articles, article, comments, user, userReaction });
                    });
                });
            } else {
                // Si l'utilisateur n'est pas connecté, afficher sans réaction
                db.query('SELECT * FROM articles ORDER BY created_at DESC', (err, articles) => {
                    if (err) {
                        return res.status(500).send('Erreur lors de la récupération des articles');
                    }

                    res.render('news', { articles, article, comments, user, userReaction: null });
                });
            }
        });
    });
});

// Route pour ajouter un commentaire (utilisateur connecté uniquement)
app.post('/news/:id/comment', (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Non autorisé');
    }

    const articleId = req.params.id;
    const { content } = req.body;
    const userId = req.session.user.id;

    db.query('INSERT INTO comments (article_id, user_id, content) VALUES (?, ?, ?)', [articleId, userId, content], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erreur lors de l\'ajout du commentaire');
        }
        res.redirect(`/news/${articleId}`);
    });
});

// Route pour ajouter une réaction (coeur, rire, wow, etc.)
app.post('/news/:id/reaction', (req, res) => {
    const articleId = req.params.id;
    const { reaction } = req.body;
    const user = req.session.user;

    if (!user) {
        return res.status(403).send('Vous devez être connecté pour réagir.');
    }

    // Vérifier si l'utilisateur a déjà réagi à cet article
    db.query('SELECT * FROM reactions WHERE user_id = ? AND article_id = ?', [user.id, articleId], (err, result) => {
        if (err) {
            console.error('Erreur lors de la récupération des réactions:', err);
            return res.status(500).send('Erreur lors de la récupération des réactions');
        }

        if (result.length > 0) {
            // Si l'utilisateur a déjà réagi, mettre à jour sa réaction
            db.query('UPDATE reactions SET reaction_type = ? WHERE user_id = ? AND article_id = ?', [reaction, user.id, articleId], (err) => {
                if (err) {
                    console.error('Erreur lors de la mise à jour de la réaction:', err);
                    return res.status(500).send('Erreur lors de la mise à jour de la réaction');
                }
                console.log('Réaction mise à jour avec succès');
                res.redirect('/news/' + articleId);
            });
        } else {
            // Si l'utilisateur n'a pas encore réagi, ajouter une nouvelle réaction
            db.query('INSERT INTO reactions (user_id, article_id, reaction_type) VALUES (?, ?, ?)', [user.id, articleId, reaction], (err) => {
                if (err) {
                    console.error('Erreur lors de l\'ajout de la réaction:', err);
                    return res.status(500).send('Erreur lors de l\'ajout de la réaction');
                }
                console.log('Réaction ajoutée avec succès');
                res.redirect('/news/' + articleId);
            });
        }
    });
});


app.post('/add-comment/:articleId', (req, res) => {
    const articleId = req.params.articleId;
    const { comment } = req.body;
    const user = req.session.user;

    if (!user) {
        return res.status(403).send('Vous devez être connecté pour commenter.');
    }

    db.query('INSERT INTO comments (user_id, article_id, comment) VALUES (?, ?, ?)', [user.id, articleId, comment], (err) => {
        if (err) {
            console.error('Erreur lors de l\'ajout du commentaire:', err);
            return res.status(500).send('Erreur lors de l\'ajout du commentaire');
        }

        res.redirect('/news/' + articleId);
    });
});

app.post('/delete-comment/:commentId', (req, res) => {
    const commentId = req.params.commentId;
    const user = req.session.user;

    if (!user) {
        return res.status(403).send('Vous devez être connecté pour supprimer un commentaire.');
    }

    db.query('SELECT * FROM comments WHERE id = ? AND user_id = ?', [commentId, user.id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(403).send('Vous ne pouvez pas supprimer ce commentaire.');
        }

        db.query('DELETE FROM comments WHERE id = ?', [commentId], (err) => {
            if (err) {
                console.error('Erreur lors de la suppression du commentaire:', err);
                return res.status(500).send('Erreur lors de la suppression du commentaire');
            }

            res.redirect('back');
        });
    });
});


app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.grade_id < 2) {
        return res.status(403).send('Accès refusé');
    }
    res.render('admin');
});

// Route pour ajouter un article via l'administration
app.post('/admin/add-article', (req, res) => {
    if (!req.session.user || req.session.user.grade_id < 2) {
        return res.status(403).send('Accès refusé');
    }

    const { title, content } = req.body;
    
    db.query('INSERT INTO articles (title, content) VALUES (?, ?)', [title, content], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erreur lors de l\'ajout de l\'article');
        }
        res.redirect('/news');
    });
});

// Démarrage du serveur
app.listen(3000, () => {
    console.log('Server running on port 3000');
});
