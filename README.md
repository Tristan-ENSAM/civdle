# Civdle

Jeu quotidien de devinettes sur les leaders de Civilization VI, inspiré de pokedle.
Site 100 % statique (HTML/CSS/JS, modules ES), sans build ni dépendance.

## Lancer en local

Les navigateurs bloquent `fetch()` et les modules ES en `file://`, il faut donc un serveur local :

```
cd civdle
python -m http.server 8000
```

puis ouvrir http://localhost:8000.

## Déployer

N'importe quel hébergement statique convient (GitHub Pages, Netlify, etc.) : il suffit de publier le dossier tel quel.
Le bouton « Copier le résultat » utilise l'API presse-papiers, qui exige HTTPS (ou localhost) ; sinon une boîte de dialogue affiche le texte à copier.

## Arborescence

```
index.html
css/style.css
data/config.json        réglages + colonnes du mode Classique
data/leaders.json       données des leaders (actuellement : 6 leaders FICTIFS de test)
data/catalogs.json      catalogues identifiant -> libellé + icône (quartiers, types d'unités)
img/portraits/          portraits (actuellement : placeholders de test)
img/icons/              icônes des catalogues (actuellement : placeholders de test)
js/main.js              chargement, onglets, routage (#classic, #portrait…)
js/core/                moteur commun (tirage quotidien, saisie, sauvegarde, partage)
js/modes/               un fichier par mode + index.js (registre)
tools/csv2json.py       conversion CSV -> leaders.json
tools/leaders_template.csv
```

## Données

### config.json

| Clé | Rôle |
|---|---|
| `timezone` | Fuseau qui définit « aujourd'hui » pour tous les joueurs (défaut `Europe/Paris`). |
| `epoch` | Date du jour n° 0 de la séquence. |
| `salt` | Chaîne quelconque ; la changer rebat toutes les séquences. À changer avant la mise en ligne. |
| `eras` | Liste ordonnée des ères, utilisée pour les flèches ↑/↓. **Les valeurs actuelles sont des placeholders.** |
| `classicAttributes` | Colonnes du mode Classique : `key` (champ du leader), `label`, `type`, et facultativement `catalog`. |

Types de comparaison disponibles pour `classicAttributes` :

- `exact` : vert si identique, rouge sinon (`null` = `null` compte comme identique, affiché « Aucun »).
- `set` : liste de valeurs ; vert si mêmes éléments, orange si au moins un en commun, rouge sinon.
- `ordered` : la valeur doit figurer dans la liste nommée par `order` (ex. `"order": "eras"`) ; rouge + flèche vers la réponse si différent.

Option `catalog` : les valeurs du leader sont des identifiants, comparés tels quels, et affichés par l'icône correspondante de `catalogs.json` (libellé en infobulle). Sans icône, ou si l'image ne se charge pas, le libellé s'affiche en texte.

Ajouter une colonne = ajouter le champ dans les leaders et une entrée dans `classicAttributes` (plus un catalogue si elle s'affiche en icônes). Aucun code à modifier.

### catalogs.json

```json
{
  "districts": {
    "id_quartier": { "label": "Nom du quartier", "icon": "img/icons/xxx.png" }
  },
  "unitClasses": {
    "cav_lourde": { "label": "Cavalerie lourde", "icon": "img/icons/xxx.png" }
  }
}
```

- `districts` : un identifiant par quartier unique, avec son logo.
- `unitClasses` : un identifiant par type d'unité, avec le logo de l'unité de base de la catégorie. Le leader référence le type de son ou ses unités uniques, pas l'unité elle-même.
- Deux leaders sont « identiques » sur une colonne s'ils ont le même identifiant : l'icône n'intervient pas dans la comparaison.
- Un identifiant utilisé par un leader mais absent du catalogue est signalé dans la console.

### leaders.json

```json
{
  "id": "identifiant_unique",
  "name": "Nom affiché",
  "aliases": ["autres noms acceptés à la saisie"],
  "civilization": "…",
  "era": "… (doit figurer dans config.eras)",
  "continent": "…",
  "uniqueDistrict": "id du catalogue districts, ou null",
  "uniqueUnitClass": ["id(s) du catalogue unitClasses"],
  "gender": "…",
  "portrait": "img/portraits/xxx.png",
  "silhouette": "img/silhouettes/xxx.png",
  "silhouetteFocus": [48, 30],
  "descriptions": ["extrait 1 (le plus difficile)", "extrait 2", "…"],
  "maskWords": ["mots supplémentaires à masquer dans les descriptions"]
}
```

- Champs facultatifs : `aliases`, `silhouette`, `silhouetteFocus`, `maskWords`.
- Un leader sans `portrait` est exclu des modes Portrait et Silhouette (sauf s'il a une `silhouette`) ; sans `descriptions`, il est exclu du mode Description. Il reste devinable partout.
- Les incohérences (id en double, attribut absent, ère inconnue, identifiant absent d'un catalogue) sont signalées dans la console du navigateur au chargement.
- Recherche à la saisie : insensible à la casse et aux accents, sur `name` et `aliases`.

Depuis un tableur : exporter en CSV avec l'en-tête de `tools/leaders_template.csv` (listes séparées par `|`, `silhouetteFocus` au format `x;y`), puis :

```
python tools/csv2json.py leaders.csv data/leaders.json
```

## Fonctionnement du tirage quotidien

Pour chaque mode, les `id` éligibles sont triés puis mélangés par un générateur pseudo-aléatoire initialisé avec `salt` + id du mode. Le jour N (compté depuis `epoch` dans `timezone`) prend l'élément `N mod nombre_de_leaders`.

Conséquences :
- chaque mode a son propre leader du jour ;
- pas de répétition avant d'avoir parcouru tous les leaders éligibles ;
- **ajouter ou retirer un leader change la séquence, y compris la réponse du jour en cours.** Mieux vaut publier les modifications de données juste après minuit (heure de `timezone`).

## Ajouter un mode de jeu

1. Créer `js/modes/monmode.js` :

```js
import { defaultGuessRow } from "../core/game.js";

export default {
  id: "monmode",                 // unique ; sert à la graine et au stockage
  label: "Mon mode",             // libellé de l'onglet
  hint: "Règle en une phrase.",
  eligible: (leader) => true,    // facultatif : leaders pouvant être la réponse
  setup(ctx) {                   // facultatif : construit l'indice une fois
    ctx.els.clue.textContent = "…";
  },
  update(ctx) {                  // facultatif : appelé après chaque essai
    // ctx.state.guesses.length, ctx.state.won, ctx.answer
  },
  renderGuess: (ctx, leader) => defaultGuessRow(leader, ctx.answer), // facultatif
  shareGrid: (ctx) => "",        // facultatif : lignes ajoutées au partage
};
```

2. L'ajouter dans `js/modes/index.js` (l'ordre du tableau = ordre des onglets).

Le moteur (`js/core/game.js`) gère le reste : leader du jour, saisie, historique, détection de victoire, sauvegarde, panneau de fin, compte à rebours, leader de la veille.

`ctx` contient : `answer`, `leaders`, `byId`, `config`, `state` (`guesses`, `won`), `dateStr`, `els` (`clue`, `history`, `win`, `counter`). Un mode peut y stocker ses propres références (ex. `ctx.portraitImg`).

## Réglages des modes

Valeurs par défaut arbitraires, en tête de fichier :

- `js/modes/portrait.js` : `BLUR_START = 24` (px), `STEPS = 8` (flou nul après 8 essais).
- `js/modes/silhouette.js` : `ZOOM_START = 6`, `STEPS = 8`, zone du point de zoom aléatoire `30–70 %`.

## Limites connues

- **Triche** : la réponse est calculée dans le navigateur ; les outils de développement permettent de la retrouver (ou de retirer le flou). Inhérent à un site statique.
- **Silhouette** : l'image doit avoir un fond transparent, sinon tout le cadre devient noir. Sans `silhouetteFocus`, le point de zoom aléatoire peut tomber dans le vide au début.
- **Masquage des descriptions** : insensible à la casse mais pas aux accents (« Zeta » ne masque pas « Zêta ») ; ajouter les variantes dans `aliases` ou `maskWords`.
- **Progression** : stockée dans le `localStorage` du navigateur, donc propre à chaque appareil.
- **Droits** : les portraits et textes officiels du jeu appartiennent à leurs ayants droit.
