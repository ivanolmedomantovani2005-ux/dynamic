# Copa Turbo — Fútbol Arcade

Un juego de fútbol de copa (torneo eliminatorio) al estilo de los clásicos juegos "copero", pero con su propia vuelta de tuerca: power-ups en la cancha, tiro cargado y penales completamente jugables (atacando y atajando).

## Cómo jugar

Abrí `index.html` en el navegador (no requiere instalación ni build).

- **Flechas / WASD**: mover al jugador (siempre controlás al más cercano a la pelota)
- **Espacio (mantener y soltar)**: cargar y patear al arco
- **Shift**: pase rápido al compañero mejor ubicado
- **Power-ups**: ⚡ velocidad, 🚀 tiro turbo, 🧲 imán, ❄️ congela rivales — aparecen al azar en la cancha
- Si el partido termina empatado, se define por **penales interactivos**

## Estructura

- `index.html` — pantallas del juego (menú, selección de equipo, cuadro de la copa, partido, penales, resultado)
- `css/style.css` — estilos
- `js/game.js` — motor del juego (física, IA, torneo, penales), sin dependencias externas

mi empresa
