# SteamVault — Site Web + Installateur PowerShell

Site marketing + script d'installation automatique pour SteamVault.

## Structure

```
steamvault-site/
├── index.html          ← Site web complet (landing page)
├── api/
│   └── install.ps1.js  ← Serverless Function Vercel (retourne le script PowerShell)
├── vercel.json         ← Config Vercel (routing)
└── README.md
```

## Déployer sur Vercel

### 1. Créer un repo GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TON-USER/steamvault-site.git
git push -u origin main
```

### 2. Importer sur Vercel

1. Aller sur [vercel.com](https://vercel.com)
2. "Add New Project" → Importer le repo GitHub
3. Framework Preset : **Other**
4. Cliquer Deploy

Le site sera disponible sur `https://steamvault-site.vercel.app` (ou votre domaine custom).

### 3. Configurer l'URL dans le script

Dans `api/install.ps1.js`, remplacez :
```
$GITHUB_REPO = "TON-GITHUB-USER/SteamVault"
```
par votre vrai repo GitHub contenant le `SteamVault.exe` dans ses Releases.

Et dans `index.html`, remplacez toutes les occurrences de :
```
TON-USER/SteamVault
steamvault.vercel.app
```
par vos vraies URLs.

## Commande d'installation utilisateur

Une fois déployé, vos utilisateurs peuvent installer SteamVault avec :

```powershell
irm votre-domaine.vercel.app/api/install.ps1 | iex
```

## GitHub Releases

Pour que le script fonctionne, vous devez publier `SteamVault.exe` dans les Releases GitHub :

1. Sur votre repo → **Releases** → **Draft a new release**
2. Tag : `v2.0.0`
3. Uploader `SteamVault.exe` comme asset
4. Publier

Le script télécharge automatiquement depuis :
`https://github.com/TON-USER/SteamVault/releases/latest/download/SteamVault.exe`
