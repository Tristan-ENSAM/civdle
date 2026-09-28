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
data/leaders.json       88 leaders (généré, voir « Données »)
data/catalogs.json      catalogues identifiant -> libellé + icône (quartiers, types d'unités)
img/portraits/          portraits (générés depuis le site BBG)
img/icons/              icônes des quartiers et types d'unités
js/main.js              chargement, onglets, routage (#classic, #portrait…)
js/core/                moteur commun (tirage quotidien, saisie, sauvegarde, partage)
js/modes/               un fichier par mode + index.js (registre)
tools/bbg/               génération des données depuis BBG + sources.json
tools/csv2json.py       conversion CSV -> leaders.json
tools/leaders_template.csv
```

## Données

### Provenance

`data/leaders.json`, `data/catalogs.json` et `img/portraits/` sont **générés** par `tools/bbg/build.py` ; ne pas les éditer à la main (sauf `era`, voir plus bas), les modifications seraient écrasées à la prochaine génération.

| Champ | Source |
|---|---|
| leaders, civilisation, textes des descriptions, portraits | Site BBG (dépôt `civ6bbg/civ6bbg.github.io`), `fr_FR/leaders_7.5.html`, `en_US/leaders_7.5.html`, `images/leaders/` |
| `uniqueUnitClass` | 1re phrase de la description BBG de chaque unité unique (« Unité de cavalerie lourde… »), règles dans `UNIT_CLASS_RULES` |
| `uniqueDistrict` | quartier de base remplacé, lu dans « remplaçant le … » de la description BBG |
| `extension` | wiki Civilization (fandom) pour les leaders officiels ; pour BBG Expanded, 1re version BBG dont la page `bbg_expanded_X.html` liste le leader |
| `gender` | Wikidata, propriété P21 |
| `continent` | champ « Location » des pages civilisation du wiki (Wikidata/Wikipédia pour les civs BBG Expanded) ; le texte source est conservé dans `tools/bbg/sources.json` |
| `silhouetteFocus` | calculé : point du contour de la silhouette (transparence du portrait) |
| `era` | **non renseigné** : aucune source ; colonne retirée du mode Classique tant qu'elle est vide |

Le détail (règles, cas interprétés marqués `"interpretation": true`) est dans `tools/bbg/sources.json`.

### Régénérer les données

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/civ6bbg/civ6bbg.github.io bbg
git -C bbg sparse-checkout set --no-cone '/fr_FR/leaders_7.5.html' '/en_US/leaders_7.5.html' '/images/leaders/'
pip install pillow
python tools/bbg/build.py bbg 7.5
```

Pour une nouvelle version BBG : remplacer `7.5`, puis compléter `tools/bbg/sources.json` pour les nouveaux leaders (le script signale sur la sortie d'erreur toute valeur manquante ou toute unité/quartier non classé ; il ne devine rien).

### config.json

| Clé | Rôle |
|---|---|
| `timezone` | Fuseau qui définit « aujourd'hui » pour tous les joueurs (défaut `Europe/Paris`). |
| `epoch` | Date du jour n° 0 de la séquence. |
| `salt` | Chaîne quelconque ; la changer rebat toutes les séquences. À changer avant l'annonce du site. |
| `eras` | Liste ordonnée des ères, pour une colonne de type `ordered` (vide actuellement). |
| `classicAttributes` | Colonnes du mode Classique : `key` (champ du leader), `label`, `type`, et facultativement `catalog` / `order`. |

Types de comparaison disponibles pour `classicAttributes` :

- `exact` : vert si identique, rouge sinon (`null` = `null` compte comme identique, affiché « Aucun »).
- `set` : liste de valeurs ; vert si mêmes éléments, orange si au moins un en commun, rouge sinon.
- `ordered` : la valeur doit figurer dans la liste nommée par `order` (ex. `"order": "eras"`) ; rouge + flèche vers la réponse si différent.

Option `catalog` : les valeurs sont des identifiants, comparés tels quels, affichés par l'icône correspondante de `catalogs.json` (libellé en infobulle ; sans icône, le libellé s'affiche en texte).

### Activer la colonne Ère

1. Remplir `era` pour chaque leader dans `data/leaders.json` (attention : écrasé par `build.py` ; reporter ensuite les valeurs dans le script ou `sources.json`).
2. Mettre la liste ordonnée des ères dans `config.eras`.
3. Ajouter `{ "key": "era", "label": "Ère", "type": "ordered", "order": "eras" }` dans `classicAttributes`.

### Format d'un leader

```json
{
  "id": "america-teddy-roosevelt-rough-rider",
  "name": "Theodore Roosevelt (Rough Rider)",
  "aliases": ["Teddy Roosevelt", "…"],
  "civilization": "Amérique",
  "era": null,
  "continent": ["Amérique du Nord"],
  "uniqueDistrict": [],
  "uniqueUnitClass": ["air_fighter", "heavy_cavalry"],
  "gender": "Homme",
  "extension": "Jeu de base",
  "portrait": "img/portraits/….webp",
  "silhouetteFocus": [26.6, 89.8],
  "descriptions": ["capacité du leader", "capacité de la civ", "éléments uniques…"],
  "maskWords": ["mots masqués dans les descriptions"],
  "source": { "bbg": "leaders_7.5.html", "civKey": "…", "leaderKey": "…" }
}
```

- Recherche à la saisie : insensible à la casse et aux accents, sur `name` et `aliases` (noms anglais inclus).
- Les incohérences (id en double, attribut absent, identifiant absent d'un catalogue) sont signalées dans la console du navigateur.
- `tools/csv2json.py` reste disponible pour saisir des leaders à la main depuis un tableur.

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
- `js/modes/silhouette.js` : `ZOOM_START = 5`, `STEPS = 8` ; la vue est centrée sur `silhouetteFocus` (point aléatoire `30–70 %` s'il est absent).

## Limites connues

- **Triche** : la réponse est calculée dans le navigateur ; les outils de développement permettent de la retrouver (ou de retirer le flou). Inhérent à un site statique.
- **Silhouette** : l'image doit avoir un fond transparent, sinon tout le cadre devient noir. Sans `silhouetteFocus`, le point de zoom aléatoire peut tomber dans le vide au début.
- **Masquage des descriptions** : insensible à la casse mais pas aux accents (« Zeta » ne masque pas « Zêta ») ; ajouter les variantes dans `aliases` ou `maskWords`.
- **Progression** : stockée dans le `localStorage` du navigateur, donc propre à chaque appareil.
- **Droits** : les portraits (issus du site BBG) et les textes du jeu appartiennent à leurs ayants droit.
