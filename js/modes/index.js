/**
 * Mode registry. To add a game mode:
 *   1. create js/modes/<name>.js exporting a mode object (see js/core/game.js);
 *   2. import it here and add it to the array (array order = tab order).
 */
import classic from "./classic.js";
import portrait, { portraitChallenge } from "./portrait.js";
import silhouette from "./silhouette.js";
import description from "./description.js";

export default [classic, portrait, portraitChallenge, silhouette, description];
