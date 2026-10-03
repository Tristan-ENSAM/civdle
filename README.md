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
data/city_states.json   48 cités-États du mode Cités-État (généré, voir « Cités-État »)
img/city-states/        emblèmes des cités-États : couleur (<id>.webp) et gris (<id>-grey.webp)
data/techs_civics.json  77 technologies + 61 dogmes du mode Technologies & Dogmes (généré)
img/techs-civics/       icônes des technologies et dogmes
data/improvements.json  58 aménagements du mode Aménagement (généré)
img/improvements/       icônes des aménagements
data/units.json         133 unités militaires du mode Son (généré)
img/units/              icônes des unités
audio/units/            sons des unités, tirés du jeu (voir « Son »)
img/portraits/          portraits (générés depuis le site BBG)
img/silhouettes/        silhouettes (textures du jeu, ou détourage estimé)
img/icons/              icônes des quartiers et types d'unités
js/main.js              chargement, onglets, routage (#classic, #portrait…, #accueil)
js/home.js              sommaire des modes (#accueil, lien sur le titre « Civdle »)
js/modes/icons.js       icônes des modes pour le sommaire (SVG dessinées pour le site)
js/core/                moteur commun (tirage quotidien, saisie, sauvegarde, partage, réglages)
js/modes/               un fichier par mode + index.js (registre)
tools/bbg/               génération des données depuis BBG + sources.json
tools/csv2json.py       conversion CSV -> leaders.json
tools/hash_assets.py    noms opaques des images indices (voir « Noms des images »)
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
| `extension` | wiki Civilization (fandom) pour les leaders officiels ; pour BBG Expanded, 1re version BBG dont la page `bbg_expanded_X.html` liste le leader. Plus affiché dans le mode Classique (remplacé par `releaseYear`) |
| `releaseYear` | année de sortie de l'extension (colonne « Sortie » du mode Classique, flèches ↑/↓ via `yearOrder` dans `config.json`) : table `releaseYear` de `tools/bbg/sources.json`, dates PC Steam / presse (détail et sources dans `_about`). BBG Expanded : année du premier commit de la page `bbg_expanded_X.html` du site BBG (7.1 → 2025, 7.5 → 2026), approximation faute de date de sortie du mod |
| `gender` | Wikidata, propriété P21 |
| `continent` | champ « Location » des pages civilisation du wiki (Wikidata/Wikipédia pour les civs BBG Expanded) ; le texte source est conservé dans `tools/bbg/sources.json` |
| `silhouette` | Les 88 leaders : contour exact tiré des fichiers du jeu par `tools/game/import_textures.py` (textures `LEADER_<NOM>_NEUTRAL.dds` du dépôt Steam « Civilization VI SDK Assets », et images `FALLBACK_NEUTRAL_*` des paquets `LeaderFallbackImages.blp` de chaque DLC, lus par `tools/game/blp.py` ; association image → leader dans `tools/game/mapping.json`, vérifiée visuellement), et pour les 11 leaders BBG Expanded, des paquets `LeaderFallback*.blp` du mod (Workshop 289070/3533091092). Ancienne méthode, conservée : détourage estimé du médaillon BBG par `tools/bbg/make_silhouettes.py` (BiRefNet / ISNet via rembg, rejets dans `tools/bbg/silhouettes_rejected.json`) |
| `silhouetteSource` | `"game"` (fichiers du jeu), `"mod"` (fichiers du mod BBG Expanded), `"cutout"` (détourage estimé) ou `null`. Le mode Silhouette n'utilise que les sources listées dans `SOURCES` de `js/modes/silhouette.js` (actuellement `["game", "mod"]`) |
| `silhouetteFocus` | calculé : point du contour, dans le quart supérieur de la figure (tête, coiffe) |
| `reveal` | image en couleur du personnage qui a servi à la silhouette, affichée à la victoire en mode Silhouette (écrite par `tools/game/import_textures.py` dans `img/reveal/`, même cadrage que la silhouette) ; sans elle, le portrait BBG est affiché |
| `eyes` | mode Regard : centre et largeur (coin à coin) de chaque œil, `{"right": [cx, cy, w], "left": [cx, cy, w], "angle": a}` en % du portrait BBG, et inclinaison de la ligne des yeux en degrés. Détecté par `tools/bbg/detect_eyes.py` (MediaPipe Face Mesh, repères 33/133 et 263/362), vérifié visuellement sur une planche contact (`--sheet`) ; valeurs manuelles dans `tools/bbg/eyes_overrides.json`, exclusions dans `tools/bbg/eyes_rejected.json` (aucun des deux fichiers n'existe pour l'instant). Demande `mediapipe==0.10.14` (Python ≤ 3.12) : les versions récentes téléchargent leur modèle à l'exécution |
| `eyeImages` | mode Regard : `img/eyes/<id>-<right|left>.webp`, carré centré sur l'œil, redressé, de côté 3 × la largeur de l'œil, agrandi ×4 par Real-ESRGAN (`realesrgan-x4plus`, sur CPU via ncnn ; modèle fourni dans le paquet `realesrgan-ncnn-py`). Écrit par `tools/bbg/make_eye_images.py`. La super-résolution invente des détails plausibles, ce n'est pas la texture d'origine |
| `era` | **non renseigné** : aucune source ; colonne retirée du mode Classique tant qu'elle est vide |

Le détail (règles, cas interprétés marqués `"interpretation": true`) est dans `tools/bbg/sources.json`.

### Régénérer les données

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/civ6bbg/civ6bbg.github.io bbg
git -C bbg sparse-checkout set --no-cone '/fr_FR/leaders_7.5.html' '/en_US/leaders_7.5.html' '/images/leaders/'
pip install pillow numpy "rembg[cpu]"
python tools/bbg/build.py bbg 7.5              # portraits + données
python tools/game/import_textures.py "<SDK Assets>/Civ6" "<jeu>" "<mod BBG Expanded>"   # silhouettes exactes (88 leaders)
python tools/bbg/make_silhouettes.py            # silhouettes estimées des autres (long : ~20 s par portrait, ~6 Go de RAM)
python tools/bbg/build.py bbg 7.5              # relancer pour intégrer les silhouettes
```

Les générateurs écrivent et cherchent les images sous leur nom lisible (`img/silhouettes/<id>.png`…). Avant de lancer l'un d'eux (ici ou dans les sections suivantes), remettre ces noms avec `python tools/hash_assets.py --restore`, puis relancer `python tools/hash_assets.py` une fois la génération finie (voir « Noms des images »).

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
- `ordered` : la valeur doit figurer dans la liste nommée par `order` (ex. `"order": "yearOrder"`) ; rouge + flèche vers la réponse si différent. Un élément de la liste peut être un tableau de valeurs ex æquo (même rang : rouge sans flèche).

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
  "releaseYear": "2016",
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

### Cités-État

`data/city_states.json` et `img/city-states/` sont **générés** par `tools/bbg/build_city_states.py` depuis la page des cités-États du site BBG :

```
git -C bbg sparse-checkout add '/fr_FR/city_states_7.5.html' '/en_US/city_states_7.5.html' '/images/city_states/'
python tools/bbg/build_city_states.py bbg 7.5
```

| Champ | Source |
|---|---|
| `name`, `type` | `fr_FR/city_states_7.5.html` (nom affiché, rubrique Culturelle / Industrielle / …) |
| `aliases` | nom anglais de `en_US/city_states_7.5.html` s'il diffère |
| `id` | nom du fichier d'icône BBG (nom anglais), ex. `Vatican City.webp` → `vatican-city`. La clé LOC n'est pas utilisée car certaines sont d'anciennes clés du jeu (`PALENQUE` → Mitla, `LISBON` → Mogadiscio, `ANTIOCH` → Venise, `BABYLON` → Anshan) ; elle est conservée dans `source.locKey` |
| `icon` | `images/city_states/*.webp` du site BBG, copiée telle quelle |
| `iconGrey` | calculée : sur les icônes BBG, fond uniforme (24, 24, 24) et une seule couleur de glyphe, qui correspond au type (vérifié sur les 48 icônes de la 7.5 ; le script s'arrête si une icône ne suit pas ce schéma). Une simple conversion en niveaux de gris laisserait deviner le type (glyphe rouge → gris foncé, blanc → blanc) ; chaque pixel est donc projeté sur l'axe fond → couleur du glyphe et redessiné dans un gris unique (`GREY = 190`, arbitraire), anticrénelage conservé |

### Technologies & Dogmes

`data/techs_civics.json` et `img/techs-civics/` sont **générés** par `tools/bbg/build_techs_civics.py` :

```
git -C bbg sparse-checkout add '/fr_FR/tech_tree_7.5.html' '/en_US/tech_tree_7.5.html' '/fr_FR/civic_tree_7.5.html' '/en_US/civic_tree_7.5.html' '/images/techs/' '/images/civic/'
python tools/bbg/build_techs_civics.py bbg 7.5
```

| Champ | Source |
|---|---|
| `name`, `era` | `fr_FR/tech_tree_7.5.html` et `fr_FR/civic_tree_7.5.html` (nom affiché, rubrique d'ère) |
| `aliases` | nom anglais des pages `en_US` s'il diffère |
| `kind` | `"tech"` ou `"civic"` selon la page |
| `id` | `tech-` / `civic-` + nom du fichier d'icône BBG, ex. `tech-bronze-working` |
| `icon` | `images/techs/*.webp`, `images/civic/*.webp` du site BBG (160 px, fond transparent), copiées telles quelles |

Le script s'arrête si un nom français apparaît deux fois (la saisie se fait sur les noms) : ce n'est pas le cas en 7.5.

### Aménagement

`data/improvements.json` et `img/improvements/` sont **générés** par `tools/bbg/build_improvements.py` :

```
git -C bbg sparse-checkout add '/fr_FR/improvements_7.5.html' '/en_US/improvements_7.5.html' '/images/improvements/'
python tools/bbg/build_improvements.py bbg 7.5
```

`name` vient de `fr_FR/improvements_7.5.html`, `aliases` du nom anglais (`en_US`) s'il diffère, `icon` de `images/improvements/` (fond transparent, copiée telle quelle), `id` du nom du fichier d'icône sans accents (`Pā.webp` → `pa`). Les 3 icônes du dossier BBG que la page n'utilise pas sont ignorées.

### Son

`data/units.json` et `img/units/` sont **générés** par `tools/bbg/build_units.py` depuis la page des unités du site BBG :

```
git -C bbg sparse-checkout add '/fr_FR/units_7.5.html' '/en_US/units_7.5.html' '/images/units/'
python tools/bbg/build_units.py bbg 7.5
```

`name` vient de `fr_FR/units_7.5.html`, `aliases` du nom anglais (`en_US`) s'il diffère, `icon` de `images/units/` (copiée telle quelle, affichée à la victoire et dans l'historique), `id` du nom du fichier d'icône sans accents (`Voi_Chiến.webp` → `voi-chien`). Les 4 unités religieuses (missionnaire, apôtre, inquisiteur, guru) sont écartées ; les unités de soutien (bélier, médecin, convoi…) sont gardées. En 7.5, `COG` n'a pas de nom sur la page (« Not found ») et est ignorée ; l'icône de `Longbowman` manque dans le dossier BBG (`icon: null`).

**Sons** : le site BBG n'en a pas. Trois sons par unité dans `audio/units/`, nommés `<id>-<type>` avec `type` = `move` (déplacement), `attack` (attaque) ou `select` (sélection) (`audio/units/knight-move.mp3` ; `.mp3`, `.ogg`, `.m4a`, `.wav` ou `.webm`), puis relancer `build_units.py` (après `hash_assets.py --restore`) : il remplit `sounds` (`{move, attack, select}`) et signale les fichiers mal nommés. Seules les unités qui ont les trois sons peuvent être la réponse du jour ; sans aucune, le mode affiche un message. Chaque nouveau son change la séquence du mode (voir « Fonctionnement du tirage quotidien »).

Les fichiers du dépôt sont tirés des banques Wwise de Civilization VI (Windows, jeu de base et DLC) et ne couvrent que les **unités non uniques** (sans `TraitType` dans la table `Units` du jeu) : 51 unités. Pour chacune, le son joué par le jeu à la sélection (`Unit_Selected`), au déplacement (`Unit_Move_2D`, terrain prairie) et à l'attaque (`Unit_Attack_2D`), selon la valeur du switch Wwise « Unit » donnée par `ArtDefs/Units.artdef`. Une unité n'a des sons que si son son de sélection contient un enregistrement qu'aucune autre unité non unique ne joue ; les sons de déplacement et d'attaque, eux, sont souvent communs à toute une classe (fantassins, cavaliers, navires…). Des unités qui ont exactement le même bruitage partagent un seul fichier (voir « Noms des images »).

### Noms des images

Dans le dépôt, les images indices (portraits, silhouettes, `reveal`, yeux, emblèmes des cités-États, aménagements, technologies et dogmes, icônes des unités) et les sons du mode Son portent un nom tiré d'un hash de leur contenu (`img/silhouettes/3f9c0d….png`), et non l'id de la réponse : sinon l'outil d'inspection du navigateur montrerait la réponse dans le `src` de l'image indice. `tools/hash_assets.py` fait le renommage et réécrit les chemins dans `data/*.json` ; `--restore` remet les noms lisibles, déduits de l'`id` et du champ de chaque enregistrement (tableau dans l'en-tête du script). Les deux sens sont idempotents. Deux fichiers au contenu identique (bruitage commun à plusieurs unités) deviennent un seul fichier haché, recopié sous chaque nom lisible par `--restore`. Les sections ci-dessus décrivent les noms lisibles, ceux que les générateurs produisent.

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

Pour un mode dont la réponse n'est pas un leader, ajouter `pool: "cityStates"` (nom d'un pool déclaré dans `EXTRA_POOLS` de `js/core/data.js`, avec son fichier JSON), `texts` (libellés : `none`, `placeholder`, `label`, `next`, `yesterday`, voir `TEXTS` dans `js/core/game.js`) et, si les vignettes trahissent la réponse, `suggestionImages: false`. Les autres modes ne sont pas affectés : chaque mode a sa propre séquence.

Le moteur (`js/core/game.js`) gère le reste : leader du jour, saisie, historique, détection de victoire, sauvegarde, panneau de fin, compte à rebours, leader de la veille.

`ctx` contient : `answer`, `leaders`, `byId`, `config`, `state` (`guesses`, `won`), `dateStr`, `els` (`clue`, `history`, `win`, `counter`). Un mode peut y stocker ses propres références (ex. `ctx.portraitImg`).

## Réglages des modes

Valeurs par défaut arbitraires, en tête de fichier :

- `js/modes/portrait.js` : `BLUR_START = 24` (px), `STEPS = 8` (flou nul après 8 essais) ; case « Mode challenger » : nuances de gris + rotation du jour entre `ROTATE_MIN = 60` et `ROTATE_MAX = 300` degrés, jusqu'à la victoire (affichage seulement, même leader du jour ; cochée par défaut, état de la case mémorisé dans le navigateur).
- `css/style.css` : apparition des cases du mode Classique, 350 ms entre deux cases (`--reveal-step`), 550 ms par case.
- `js/modes/regard.js` : `EYE_SIDE = "daily"` (œil droit ou gauche tiré chaque jour ; `"right"`/`"left"` pour le fixer), cadre rond, diamètre visible de `VIEW_START = 1.6` à `VIEW_END = 3` fois la largeur de l'œil en `STEPS = 10` essais. `VIEW_END` doit être identique dans `tools/bbg/make_eye_images.py` (l'image contient exactement cette vue) ; au-delà de ~3, l'autre œil entre dans le cadre. Source : portraits BBG de 256 px, où un œil mesure environ 15 à 25 px.
- `js/modes/citystates.js` : aucun indice supplémentaire après un essai raté. Case « Mode challenger » cochée par défaut (état mémorisé dans le navigateur) : emblème en gris uniforme (`iconGrey`), couleurs affichées à la victoire. Suggestions de saisie sans icône (sinon la liste permettrait de comparer les formes).
- `js/modes/techscivics.js` : `BLUR_START = 24` (px), `STEPS = 8` (mêmes valeurs que Portrait) ; réponse tirée parmi les technologies et les dogmes réunis. Suggestions de saisie sans icône.
- `js/modes/improvements.js` : `BLUR_START = 10` (px), `STEPS = 6`, flou plus léger que Portrait et Technologies. Suggestions de saisie sans icône.
- `js/modes/son.js` : les sons sont les seuls indices, du plus général au plus parlant : déplacement dès le départ, attaque après `UNLOCK.attack = 2` essais ratés, sélection après `UNLOCK.select = 4` ; rien d'autre n'apparaît après un essai raté, l'icône de l'unité s'affiche à la victoire. Les sons sont joués par l'API Web Audio (pas d'élément `<audio>` dont le `src` serait visible dans l'inspecteur). Les unités uniques restent proposées à la saisie mais ne sont jamais la réponse.
- `js/modes/silhouette.js` : `ZOOM_START = 3.5`, `STEPS = 12` ; la vue est centrée sur `silhouetteFocus` (point aléatoire `30–70 %` s'il est absent).

## Limites connues

- **Triche** : la réponse est calculée dans le navigateur ; les outils de développement permettent de la retrouver. Inhérent à un site statique. Les noms opaques des images (« Noms des images ») et le hash de la réponse dans le `localStorage` (`answerKey`) évitent seulement qu'elle se lise d'un coup d'œil dans l'inspecteur : le code du tirage et les données restent publics. Les indices en image (flou, gris, rotation, zoom, recadrage de l'œil) sont dessinés sur un `<canvas>` par `js/core/clue.js`, donc l'inspecteur ne montre ni l'image nette ni un filtre CSS à retirer ; mais le fichier d'origine reste téléchargé et visible dans l'onglet Réseau.
- **Silhouette** : l'image doit avoir un fond transparent, sinon tout le cadre devient noir. Sans `silhouetteFocus`, le point de zoom aléatoire peut tomber dans le vide au début.
- **Masquage des descriptions** : insensible à la casse mais pas aux accents (« Zeta » ne masque pas « Zêta ») ; ajouter les variantes dans `aliases` ou `maskWords`.
- **Progression** : stockée dans le `localStorage` du navigateur, donc propre à chaque appareil.
- **Droits** : les portraits (issus du site BBG) et les textes du jeu appartiennent à leurs ayants droit, de même que les sons du mode Son s'ils sont tirés du jeu.
