# Outil de commercialisation VEFA – Les Commercialisateurs

Prototype interne pour présenter nos programmes immobiliers neufs en Île-de-France, laisser les visiteurs choisir un lot et recueillir leurs demandes, avec un back-office pour gérer programmes, lots et leads.

> Code et design originaux. Les 3 programmes de démonstration sont **fictifs** (noms inventés, visuels générés, contacts « @exemple.fr »).

---

## 1. Installation

Prérequis : **Node.js 22.13 ou plus récent** (`node -v`; Node 22 LTS ou 24 conviennent). Aucun service externe, aucune compilation (pas besoin de Visual Studio) : la base SQLite est celle intégrée à Node et tient dans un seul fichier.

```bash
npm install
npm start
```

Ouvrir ensuite <http://localhost:3000>. Le back-office est sur <http://localhost:3000/admin>.

Au premier démarrage, si la base est vide, les données de démonstration sont chargées automatiquement (sauf en production).
Sans fichier `.env`, un compte `admin@exemple.fr` est créé avec un **mot de passe aléatoire affiché une seule fois dans la console**.

Pour choisir vous-même l'identifiant et le mot de passe, créez le `.env` **avant** le premier démarrage :

```bash
cp .env.example .env     # puis éditez ADMIN_EMAIL, ADMIN_PASSWORD et SESSION_SECRET
npm start
```

### Commandes

| Commande | Effet |
| --- | --- |
| `npm start` | Lance l'application |
| `npm run dev` | Lance l'application et la redémarre à chaque modification du code |
| `npm run seed` | **Remplace** programmes, lots et leads par les données de démonstration (les comptes admin sont conservés) |
| `npm test` | Lance les tests automatiques (filtres des lots, import CSV/Excel, formulaire de contact, uploads) |

## 2. Configuration (`.env`)

Toutes les variables sont décrites dans [`.env.example`](.env.example). Les principales :

| Variable | Rôle |
| --- | --- |
| `NODE_ENV` | `production` en ligne : cookies sécurisés (HTTPS), pas de données de démo automatiques, `SESSION_SECRET` obligatoire |
| `PORT` | Port d'écoute (3000 par défaut) |
| `SESSION_SECRET` | Chaîne aléatoire longue qui signe les sessions et les jetons de formulaire |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte administrateur créé au premier démarrage s'il n'en existe aucun (mot de passe de 12 caractères minimum, stocké haché avec bcrypt). Vous pouvez retirer `ADMIN_PASSWORD` du `.env` une fois le compte créé |
| `DATABASE_PATH` | Fichier SQLite (`./data/vefa.sqlite`) |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Dossier et taille maximale des images envoyées (5 Mo) |
| `FRAME_ANCESTORS` | Sites autorisés à afficher l'outil en iframe |
| `TRUST_PROXY` | `true` derrière Nginx / Caddy / un hébergeur PaaS (pour la limite anti-spam par IP) |
| `GTM_ID` | Identifiant Google Tag Manager (vide = aucun traceur) |

## 3. Ce que fait l'outil

**Site public** (aucun cookie déposé)
- Accueil : cartes des programmes (visuel, nom, ville, prix à partir de, lots disponibles), filtres ville et budget maximum.
- Page programme : visuel, accroche, description, adresse, atouts, livraison prévue, galerie, puis sélecteur de lots.
- Sélecteur de lots : vue cartes ou tableau, filtres typologie / surface / budget / étage / statut, tri par prix, surface ou étage. Filtrage instantané, et fonctionne aussi sans JavaScript. Lots vendus grisés, lots réservés avec badge distinct. Fiche détaillée (avec plan si disponible) dans une fenêtre, bouton « Je suis intéressé ».
- Formulaire de contact lié au lot : consentement RGPD obligatoire (texte conservé avec la demande), champ piège anti-robot, délai minimum de saisie, limite de 5 envois par IP et par quart d'heure, refus des envois depuis un autre site.

**Back-office** (`/admin`)
- Connexion (bcrypt, session en base, protection CSRF, 10 tentatives max par quart d'heure).
- Tableau de bord : lots par statut et par programme, leads reçus par semaine, dernières demandes.
- Programmes : création, modification, publication / brouillon, archivage, visuel principal et galerie.
- Lots : ajout, modification, plan du lot, suppression, **changement de statut directement dans la liste**.
- Import CSV / Excel avec aperçu et rapport d'erreurs ligne par ligne : soit les lots d'un programme existant, soit **plusieurs programmes d'un coup** (les programmes inconnus sont créés en brouillon).
- Leads : liste filtrable, changement de statut dans la liste (Nouveau, Contacté, RDV, Perdu, Vendu), notes internes, export CSV (ouvrable dans Excel).

## 4. Format du fichier d'import des lots

Fichier **.csv** (séparateur `;` ou `,`, encodage UTF-8 ou Windows-1252) ou **.xlsx** (première feuille). 2 Mo et 2 000 lignes maximum. La première ligne contient les en-têtes. Un modèle est téléchargeable dans le back-office, et des exemples se trouvent dans [`exemples/`](exemples/).

| Colonne | Obligatoire | Valeurs acceptées | Autres en-têtes reconnus |
| --- | --- | --- | --- |
| `reference` | oui | Lettres, chiffres, `-`, `.` (ex. `A11`) | `ref`, `lot`, `numero` |
| `batiment` | | Texte libre (ex. `A`) | `bat`, `immeuble` |
| `etage` | | Nombre entier, `RDC`, `1er`, `2e` (vide = RDC) | `niveau` |
| `typologie` | oui | `T1` à `T5`, `Maison` (`studio` = T1, `villa` = Maison) | `type`, `typo` |
| `surface` | oui | m² habitables, virgule ou point (ex. `64,5`) | `surface habitable`, `shab` |
| `exterieur` | | `balcon`, `terrasse`, `jardin`, `aucun` (`loggia` = balcon) | `type exterieur`, `annexe` |
| `surface_exterieur` | | m² | `surface exterieure`, `surface annexe` |
| `orientation` | | `N`, `S`, `E`, `O`, `NE`, `SO`… et combinaisons `E-O` | `exposition`, `expo` |
| `parking` | | Nombre de places, `oui` (= 1) ou `non` (= 0) | `places`, `stationnement` |
| `prix_ttc` | oui | Euros TTC, espaces et `€` acceptés (ex. `289 000`) | `prix`, `prix ttc` |
| `statut` | | `Disponible` (par défaut), `Réservé`, `Vendu` | `etat`, `disponibilite` |

Les en-têtes ne tiennent compte ni des majuscules, ni des accents, ni des espaces. Les colonnes inconnues sont ignorées et signalées.

**Règles d'import** : un lot dont la référence existe déjà dans le programme est **mis à jour**, les autres sont **créés**. Une colonne absente du fichier ne modifie pas les lots existants (le plan déjà envoyé est conservé). Rien n'est écrit avant d'avoir cliqué sur « Valider l'import » ; les lignes en erreur sont ignorées et listées avec leur numéro de ligne.

### Créer des programmes par import (Programmes > Importer des programmes)

Même fichier que ci-dessus, avec en plus ces colonnes sur **chaque ligne** (une ligne = un lot) :

| Colonne | Obligatoire | Exemple |
| --- | --- | --- |
| `programme` | oui | Résidence des Tilleuls |
| `ville` | oui | Serris |
| `code_postal` | | 77700 |
| `adresse` | | Quartier de la gare |
| `livraison` | | 3e trimestre 2027 |

Les lots sont regroupés par nom de programme. Un programme inconnu est **créé en brouillon** (invisible sur le site) ; un programme existant (même nom) reçoit les lots. Description, atouts et visuels se complètent ensuite dans la fiche du programme, puis on le passe en « Publié ». Exemple : [`exemples/programmes-et-lots.csv`](exemples/programmes-et-lots.csv).

## 5. Mise en ligne sur un sous-domaine

Exemple pour `programmes.lescommercialisateurs.com` sur un petit serveur Linux (VPS) :

1. Créer un enregistrement DNS `programmes` (type A ou CNAME) vers le serveur.
2. Copier le projet, puis : `npm ci --omit=dev`, créer le `.env` avec `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_URL=https://programmes.lescommercialisateurs.com`, `TRUST_PROXY=true`, `SEED_ON_EMPTY=false`.
3. Lancer le service en continu (systemd ou `pm2 start src/server.js --name vefa`).
4. Mettre un proxy inverse HTTPS devant. Avec Caddy, le certificat est automatique :
   ```
   programmes.lescommercialisateurs.com {
     reverse_proxy localhost:3000
   }
   ```
5. Sauvegarder chaque jour `data/` (base SQLite) et `uploads/` (images).

Les hébergeurs Node avec disque persistant (Render, Railway, Fly.io, Clever Cloud, Scalingo…) conviennent aussi : il faut un volume persistant pour `data/` et `uploads/`.

### Intégration dans le site WordPress (iframe)

Autoriser le site WordPress dans le `.env` :

```
FRAME_ANCESTORS='self' https://www.lescommercialisateurs.com https://lescommercialisateurs.com
```

Puis dans une page WordPress (bloc « HTML personnalisé ») :

```html
<iframe src="https://programmes.lescommercialisateurs.com/programmes/villa-horizon"
        title="Programme Villa Horizon" style="width:100%;height:1800px;border:0" loading="lazy"></iframe>
```

Le back-office ne peut jamais être affiché en iframe. Une API en lecture seule est aussi disponible pour une intégration future : `GET /api/programmes/<slug>/lots` (mêmes filtres que la page, ex. `?typologie=T3&budget_max=350000`).

## 6. Google Tag Manager et consentement

Par défaut, **aucun traceur ni cookie** n'est chargé. Pour activer GTM :

1. Renseigner `GTM_ID=GTM-XXXXXXX` dans le `.env` et redémarrer.
2. Un bandeau « Accepter / Refuser » apparaît. GTM n'est chargé qu'après « Accepter ». Le choix est mémorisé 6 mois et modifiable via le lien « Gérer mes préférences cookies » du pied de page.

L'emplacement est dans `views/partials/head.ejs` (inclusion du script), `views/partials/footer.ejs` (bandeau) et `public/js/consent.js` (logique). Si vous passez par une plateforme de consentement (CMP) certifiée, c'est dans `consent.js` qu'il faut la brancher. Les domaines Google sont ajoutés automatiquement à la politique de sécurité (CSP) quand `GTM_ID` est défini.

## 7. Organisation du code

```
assets/            logo (logo.png recadré, logo-original.png tel que fourni)
exemples/          fichiers d'import d'exemple (.csv, .xlsx, fichier avec erreurs)
public/            CSS, JavaScript navigateur, visuels de démo générés (demo/)
src/
  app.js           application Express (sécurité, routes, erreurs)
  server.js        démarrage
  config.js        lecture du .env
  db/              schéma SQLite
  lib/             filtres des lots (partagés serveur/navigateur), import, validation, CSRF, uploads, auth
  models/          requêtes SQL (toutes paramétrées)
  routes/          public.js (site) et admin.js (back-office)
  scripts/         seed.js (données de démo) et demoImages.js
test/              tests automatiques (node:test + supertest)
views/             gabarits EJS (échappement automatique des sorties)
```

Couleurs et police : variables en tête de `public/css/style.css` (`--c-primary: #0B6DB7`, `--c-accent: #5FCFB0`, issues du logo ; police système sans-serif, sans appel à Google Fonts).

## 8. Reste à faire avant une vraie mise en production

**Sécurité**
- Faire relire le code (ou un test d'intrusion léger) avant d'exposer le back-office.
- Gestion des comptes : plusieurs utilisateurs, rôles, changement et réinitialisation du mot de passe, double authentification.
- Restreindre l'accès à `/admin` (liste d'IP ou VPN) si possible ; tenir les dépendances à jour (`npm audit`).
- Le compteur anti-spam est en mémoire : le passer en base ou ajouter un captcha respectueux de la vie privée si le spam apparaît.

**Hébergement**
- Choisir l'hébergeur (serveur en France / UE de préférence), HTTPS obligatoire, supervision et alertes.
- Redimensionner et compresser automatiquement les images envoyées (aujourd'hui stockées telles quelles).
- Envoyer un e-mail au commercial à chaque nouveau lead (nécessite un service SMTP).

**Sauvegardes**
- Sauvegarde quotidienne chiffrée de `data/` et `uploads/`, conservée hors du serveur, avec test de restauration.

**Mentions légales et RGPD**
- Compléter les pages « Mentions légales » et « Données personnelles » (responsable de traitement, contact, hébergeur, n° de carte professionnelle).
- Faire valider le texte de consentement et la durée de conservation (3 ans proposés), tenir le registre des traitements.
- Purge automatique des leads au-delà de la durée de conservation, et procédure pour répondre aux demandes d'accès / suppression.
- Si GTM est activé : vérifier la conformité du bandeau avec les recommandations CNIL ou utiliser une CMP.

**Intégration CRM**
- Pousser chaque lead vers le CRM (API ou webhook, à brancher dans `src/routes/public.js` après `models.leads.create`).
- Synchroniser les statuts des lots avec l'outil des promoteurs ou le CRM pour éviter la double saisie.
- Ajouter le suivi de la source des leads (UTM, page d'origine) si besoin pour le marketing.
