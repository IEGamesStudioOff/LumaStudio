# Luma Studio v1.5 — prototype wireframe

Cette version reprend la base Electron existante et remplace l'interface principale par un layout inspiré des dessins préparatoires :

- barre haute avec logo, version 1.5, bouton PLAY, bouton Save et jauge de capacité ;
- colonne gauche : Scene Setup, Sprite Editor, Music Editor, Code Editor, Build / Export ;
- zone centrale avec onglets Scene/Sprite ;
- écran Scene avec preview Luma 160x128 et grille ;
- écran Sprite avec import image, propriétés, preview console, bande d'animation ;
- colonne droite avec listes Sprite/Music, caméra, layer et aperçu d'objet ;
- bibliothèque permanente à droite : Sprite, Musique, Objects, Maps, Event Sheets ;
- drag and drop des objets de la bibliothèque vers la map ;
- association par ID : un objet garde son ID, son sprite et son behavior, et les placements avec le même ID représentent le même objet.

## Lancer

```bash
npm install
npm start
```

Le dossier `node_modules` n'est pas inclus dans cette archive pour garder le zip léger. Si ton ancien dossier contient déjà `node_modules`, tu peux aussi copier uniquement les fichiers modifiés :

- `renderer/index.html`
- `renderer/style.css`
- `renderer/app.js`
- `main.js`
- `package.json`
