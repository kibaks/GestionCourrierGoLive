# Push vers le dépôt GestionCourrierBeta

Le projet est configuré pour pousser vers **https://github.com/kibaks/GestionCourrierBeta**.

## Configuration déjà faite

- Remote **beta** ajouté : `https://github.com/kibaks/GestionCourrierBeta.git`
- Votre token est enregistré dans l’URL du remote (fichier `.git/config`).

## À exécuter sur votre machine

Ouvrez un terminal (PowerShell ou CMD) **en dehors de Cursor**, dans le dossier du projet, puis :

```powershell
cd c:\Users\previ\Documents\GestionCourrier
git push -u beta main
```

Si le dépôt **GestionCourrierBeta** est vide, cette commande crée la branche `main` sur GitHub et y envoie tout l’historique.

## Récapitulatif des remotes

| Remote  | Dépôt                              |
|---------|-------------------------------------|
| origin  | https://github.com/kibaks/GestionCourrier |
| beta    | https://github.com/kibaks/GestionCourrierBeta |

Pour pousser ensuite uniquement vers Beta :

```powershell
git push beta main
```

## Sécurité

- Le token a été inséré dans l’URL du remote. Il est stocké localement dans `.git/config` (jamais poussé sur GitHub).
- **Recommandation** : après le premier push réussi, révoquez ce token sur GitHub (**Settings → Developer settings → Personal access tokens**) et générez-en un nouveau si besoin. Évitez de coller des tokens en clair dans des chats ou des fichiers versionnés.
